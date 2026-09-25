import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
import type Stripe from "stripe";
import cron from "node-cron";

let isRunning = false;
const DEFAULT_INTERVAL_MINUTES = 60; // Run every hour

export async function processPendingTransfers() {
  console.log("[stripe-transfers] Starting check for pending Stripe transfers...");

  try {
    const pendingTransfers = await prisma.invoiceConnectedAccountTransfer.findMany({
      where: {
        status: { in: ["PENDING", "FAILED"] },
      },
      include: { invoice: true }
    });

    if (pendingTransfers.length === 0) {
      console.log("[stripe-transfers] No pending or failed transfers to process today.");
      return;
    }

    const readyTransfers: typeof pendingTransfers = [];
    let totalReadyGrossAmount = 0;

    for (const transfer of pendingTransfers) {
      const stripeInvoiceId = transfer.invoice.stripeInvoiceId;
      if (!stripeInvoiceId) {
        console.warn(`[stripe-transfers] Transfer ${transfer.id} has no stripeInvoiceId. Skipping.`);
        continue;
      }

      try {
        const stripeInvoice: any = await stripe.invoices.retrieve(stripeInvoiceId, {
          expand: ["payment_intent"]
        });
        
        let chargeId = typeof stripeInvoice.charge === 'string' ? stripeInvoice.charge : stripeInvoice.charge?.id;
        
        if (!chargeId && stripeInvoice.payment_intent) {
          const pi = stripeInvoice.payment_intent;
          chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;
        }

        let balanceTx: any = null;

        if (chargeId) {
          const charge = await stripe.charges.retrieve(chargeId, {
            expand: ["balance_transaction"],
          });
          balanceTx = charge.balance_transaction;
        } else {
          console.log(`[stripe-transfers] Invoice ${stripeInvoiceId} has no charge. Searching balance transactions by amount ${stripeInvoice.total}...`);
          // Fallback: match by amount as requested by user
          const bts = await stripe.balanceTransactions.list({ limit: 10000 });
          const matchedBt = bts.data.find(
            (bt) => bt.amount === stripeInvoice.total && (bt.type === "payment" || bt.type === "charge")
          );
          if (matchedBt) {
            console.log(`[stripe-transfers] Found matching balance transaction: ${matchedBt.id}`);
            balanceTx = matchedBt;
            chargeId = matchedBt.source as string; 
          } else {
            console.warn(`[stripe-transfers] Could not find any matching balance transaction for amount ${stripeInvoice.total}. Skipping.`);
            continue; // Cannot safely proceed if we can't find the balance transaction
          }
        }

        if (balanceTx && balanceTx.status === "available") {
          // Re-resolve the correct destination in case the stored one is stale
          let destination = transfer.stripeConnectedAccountId;
          if (transfer.serviceIds && transfer.serviceIds.length > 0) {
            const service = await prisma.service.findUnique({
              where: { id: transfer.serviceIds[0] },
              select: { stripeConnectedAccountId: true },
            });
            if (service?.stripeConnectedAccountId) {
              destination = service.stripeConnectedAccountId;
            }
          }

          (transfer as any).resolvedChargeId = chargeId; 
          (transfer as any).resolvedDestination = destination;
          readyTransfers.push(transfer);
          totalReadyGrossAmount += Math.round(Number(transfer.amount) * 100); // Accumulate in CENTS
        } else {
          console.log(`[stripe-transfers] Charge ${chargeId} is still pending. Skipping until next check.`);
          if (transfer.status === "FAILED") {
            console.log(`[stripe-transfers] Self-healing DB status to PENDING for ${transfer.id}`);
            await prisma.invoiceConnectedAccountTransfer.update({
              where: { id: transfer.id },
              data: {
                status: "PENDING",
                failureMessage: "Funds are still processing in Stripe",
              }
            });
          }
        }
      } catch (error) {
        console.error(`[stripe-transfers] Error fetching charge for invoice ${stripeInvoiceId}:`, error);
      }
    }

    if (readyTransfers.length === 0) {
      console.log("[stripe-transfers] No funds have cleared right now. Exiting.");
      return;
    }

    console.log(`[stripe-transfers] Total Ready Gross (cents): ${totalReadyGrossAmount}`);

    for (const transfer of readyTransfers) {
      // transfer.amount is in dollars. Convert to cents for Stripe.
      const amountInCents = Math.round(Number(transfer.amount) * 100);

      if (amountInCents <= 0) {
        console.log(`[stripe-transfers] Amount is <= 0 for transfer ${transfer.id}. Skipping.`);
        continue;
      }

      const destination = (transfer as any).resolvedDestination || transfer.stripeConnectedAccountId;

      try {
        const created = await stripe.transfers.create({
          amount: amountInCents,
          currency: "usd",
          destination,
          transfer_group: transfer.transferGroup || undefined,
          metadata: {
            invoiceId: transfer.invoiceId,
            sourceTransactionId: (transfer as any).resolvedChargeId || "",
            originalAmount: transfer.amount.toString(),
            executedVia: "CRON_JOB",
          },
        });

        await prisma.invoiceConnectedAccountTransfer.update({
          where: { id: transfer.id },
          data: {
            stripeTransferId: created.id,
            status: "SENT",
            stripeConnectedAccountId: destination,
            amount: transfer.amount, // Keep exactly what was requested
            failureMessage: null,
          },
        });

        console.log(`[stripe-transfers] Successfully transferred full amount $${(amountInCents / 100).toFixed(2)} to ${destination}!`);
      } catch (err: any) {
        console.error(`[stripe-transfers] Failed to transfer to ${destination}:`, err);
        // If it fails (e.g. insufficient funds), mark as FAILED so it will retry later
        await prisma.invoiceConnectedAccountTransfer.update({
          where: { id: transfer.id },
          data: {
            status: "FAILED",
            failureMessage: err?.message || "Stripe transfer failed in cron",
          },
        });
      }
    }
  } catch (error) {
    console.error("[stripe-transfers] Critical error in job:", error);
  }
}

export function startStripeTransfersJob(
  cronExpression: string = "0 * * * *", // Runs at minute 0 of every hour (e.g. 11:00, 12:00, 1:00)
) {
  cron.schedule(cronExpression, async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await processPendingTransfers();
    } catch (error) {
      console.error("[stripe-transfers] Failed to process transfers:", error);
    } finally {
      isRunning = false;
    }
  });

  console.log(
    `[stripe-transfers] Job scheduled with cron expression: "${cronExpression}"`,
  );
}
