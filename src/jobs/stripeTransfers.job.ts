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
        const stripeInvoice: any = await stripe.invoices.retrieve(stripeInvoiceId);
        const chargeId = typeof stripeInvoice.charge === 'string' ? stripeInvoice.charge : stripeInvoice.charge?.id;

        if (!chargeId) {
          console.warn(`[stripe-transfers] Invoice ${stripeInvoiceId} has no charge yet. Skipping.`);
          continue;
        }

        const charge = await stripe.charges.retrieve(chargeId, {
          expand: ["balance_transaction"],
        });

        const balanceTx: any = charge.balance_transaction;

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
          totalReadyGrossAmount += Number(transfer.amount);
        } else {
          console.log(`[stripe-transfers] Charge ${chargeId} is still pending. Skipping until next check.`);
        }
      } catch (error) {
        console.error(`[stripe-transfers] Error fetching charge for invoice ${stripeInvoiceId}:`, error);
      }
    }

    if (readyTransfers.length === 0) {
      console.log("[stripe-transfers] No funds have cleared right now. Exiting.");
      return;
    }

    let availableBalanceAmount = 0;
    try {
      const balanceResponse = await stripe.balance.retrieve();
      const availableObj = balanceResponse.available.find((b) => b.currency.toLowerCase() === "usd");
      if (availableObj) {
        availableBalanceAmount = availableObj.amount;
      }
    } catch (err) {
      console.error("[stripe-transfers] Failed to retrieve platform balance:", err);
      return; 
    }

    const transferRatio =
      totalReadyGrossAmount > 0 && availableBalanceAmount < totalReadyGrossAmount
        ? Math.max(0, availableBalanceAmount) / totalReadyGrossAmount
        : 1;

    console.log(`[stripe-transfers] Total Ready Gross: $${(totalReadyGrossAmount / 100).toFixed(2)}`);
    console.log(`[stripe-transfers] Available Balance: $${(availableBalanceAmount / 100).toFixed(2)}`);
    console.log(`[stripe-transfers] Applying Ratio: ${transferRatio}`);

    for (const transfer of readyTransfers) {
      const adjustedAmount = Math.floor(Number(transfer.amount) * transferRatio);

      if (adjustedAmount <= 0) {
        console.log(`[stripe-transfers] Adjusted amount is <= 0 for transfer ${transfer.id}. Skipping.`);
        continue;
      }

      const destination = (transfer as any).resolvedDestination || transfer.stripeConnectedAccountId;

      try {
        const created = await stripe.transfers.create({
          amount: adjustedAmount,
          currency: "usd",
          destination,
          transfer_group: transfer.transferGroup || undefined,
          metadata: {
            invoiceId: transfer.invoiceId,
            sourceTransactionId: (transfer as any).resolvedChargeId || "",
            originalAmount: transfer.amount.toString(),
            adjustedAmount: adjustedAmount.toString(),
            executedVia: "CRON_JOB",
          },
        });

        await prisma.invoiceConnectedAccountTransfer.update({
          where: { id: transfer.id },
          data: {
            stripeTransferId: created.id,
            status: "SENT",
            stripeConnectedAccountId: destination, // Update it if it was stale
            amount: Number((adjustedAmount / 100).toFixed(2)),
            failureMessage: null, // Clear any previous failure message
          },
        });

        console.log(`[stripe-transfers] Successfully transferred $${(adjustedAmount / 100).toFixed(2)} to ${transfer.stripeConnectedAccountId}!`);
      } catch (err: any) {
        console.error(`[stripe-transfers] Failed to transfer to ${transfer.stripeConnectedAccountId}:`, err);
        // Optionally update the DB with failure message
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
