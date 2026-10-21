import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
import cron from "node-cron";

let isRunning = false;

export async function processPendingPrefundingTransfers() {
  console.log("[prefunding-transfers] Starting check for pending Prefunding Stripe transfers...");

  try {
    const pendingTransfers = await prisma.invoiceConnectedAccountTransfer.findMany({
      where: {
        prefundingInvoiceId: { not: null },
        status: { in: ["PENDING", "FAILED"] },
      },
      include: {
        prefundingInvoice: {
          include: { practice: true },
        },
      },
    });

    if (pendingTransfers.length === 0) {
      console.log("[prefunding-transfers] No pending prefunding transfers to process.");
      return;
    }

    const readyTransfers: typeof pendingTransfers = [];
    let totalReadyGrossAmount = 0;

    for (const transfer of pendingTransfers) {
      const pInv = transfer.prefundingInvoice;
      const stripeInvoiceId = pInv?.stripeInvoiceId;

      if (!stripeInvoiceId) {
        console.warn(`[prefunding-transfers] Transfer ${transfer.id} has no stripeInvoiceId. Skipping.`);
        continue;
      }

      try {
        const stripeInvoice: any = await stripe.invoices.retrieve(stripeInvoiceId, {
          expand: ["payment_intent"],
        });

        let chargeId =
          typeof stripeInvoice.charge === "string"
            ? stripeInvoice.charge
            : stripeInvoice.charge?.id;

        if (!chargeId && stripeInvoice.payment_intent) {
          const pi = stripeInvoice.payment_intent;
          chargeId =
            typeof pi.latest_charge === "string"
              ? pi.latest_charge
              : pi.latest_charge?.id;
        }

        let balanceTx: any = null;

        if (chargeId) {
          const charge = await stripe.charges.retrieve(chargeId, {
            expand: ["balance_transaction"],
          });
          balanceTx = charge.balance_transaction;
        } else {
          console.log(
            `[prefunding-transfers] Invoice ${stripeInvoiceId} has no direct charge. Searching balance transactions by amount ${stripeInvoice.total}...`
          );
          const bts = await stripe.balanceTransactions.list({ limit: 10000 });
          const matchedBt = bts.data.find(
            (bt) =>
              bt.amount === stripeInvoice.total &&
              (bt.type === "payment" || bt.type === "charge")
          );
          if (matchedBt) {
            balanceTx = matchedBt;
            chargeId = matchedBt.source as string;
          } else {
            console.warn(
              `[prefunding-transfers] Could not find matching balance transaction for amount ${stripeInvoice.total}. Skipping.`
            );
            continue;
          }
        }

        if (balanceTx && balanceTx.status === "available") {
          const destination =
            pInv?.practice?.prefundingStripeAccountId?.trim() ||
            transfer.stripeConnectedAccountId?.trim();

          if (!destination) {
            console.warn(
              `[prefunding-transfers] Practice for prefunding invoice ${pInv?.id} has no prefundingStripeAccountId. Skipping.`
            );
            continue;
          }

          (transfer as any).resolvedChargeId = chargeId;
          (transfer as any).resolvedDestination = destination;
          readyTransfers.push(transfer);
          totalReadyGrossAmount += Math.round(Number(transfer.amount) * 100);
        } else {
          console.log(
            `[prefunding-transfers] Charge ${chargeId} is still pending clearance in Stripe. Will retry on next cron run.`
          );
          if (transfer.status === "FAILED") {
            await prisma.invoiceConnectedAccountTransfer.update({
              where: { id: transfer.id },
              data: {
                status: "PENDING",
                failureMessage: "Funds are still processing in Stripe",
              },
            });
          }
        }
      } catch (error) {
        console.error(
          `[prefunding-transfers] Error fetching Stripe invoice ${stripeInvoiceId}:`,
          error
        );
      }
    }

    if (readyTransfers.length === 0) {
      console.log("[prefunding-transfers] No prefunding funds have cleared yet. Exiting.");
      return;
    }

    console.log(
      `[prefunding-transfers] Total Ready Gross (cents): ${totalReadyGrossAmount}`
    );

    let availableBalanceAmount = 0;
    try {
      const balanceResponse = await stripe.balance.retrieve();
      const availableObj = balanceResponse.available.find(
        (b) => b.currency.toLowerCase() === "usd"
      );
      if (availableObj) {
        availableBalanceAmount = availableObj.amount;
      }
    } catch (err) {
      console.error("[prefunding-transfers] Failed to retrieve Stripe platform balance:", err);
      return;
    }

    let remainingBalance = availableBalanceAmount;

    for (const transfer of readyTransfers) {
      const amountInCents = Math.round(Number(transfer.amount) * 100);
      let transferAmount = amountInCents;

      if (remainingBalance < amountInCents) {
        const diff = amountInCents - remainingBalance;
        if (diff <= 10000 && remainingBalance > 0) {
          transferAmount = remainingBalance;
          console.log(
            `[prefunding-transfers] Platform balance short by $${(diff / 100).toFixed(2)}. Adjusting transfer amount.`
          );
        } else {
          console.log(
            `[prefunding-transfers] Remaining balance (${remainingBalance}) too low for transfer (${amountInCents}). Skipping.`
          );
          continue;
        }
      }

      if (transferAmount <= 0) {
        continue;
      }

      remainingBalance -= transferAmount;
      const destination =
        (transfer as any).resolvedDestination || transfer.stripeConnectedAccountId;

      try {
        const created = await stripe.transfers.create({
          amount: transferAmount,
          currency: (transfer.currency || "USD").toLowerCase(),
          destination,
          transfer_group: transfer.transferGroup || undefined,
          metadata: {
            prefundingInvoiceId: transfer.prefundingInvoiceId || "",
            sourceTransactionId: (transfer as any).resolvedChargeId || "",
            originalAmount: transfer.amount.toString(),
            executedVia: "PREFUNDING_CRON_JOB",
          },
        });

        await prisma.invoiceConnectedAccountTransfer.update({
          where: { id: transfer.id },
          data: {
            stripeTransferId: created.id,
            status: "SENT",
            stripeConnectedAccountId: destination,
            amount: Number((transferAmount / 100).toFixed(2)),
            failureMessage: null,
          },
        });

        console.log(
          `[prefunding-transfers] Successfully transferred $${(transferAmount / 100).toFixed(2)} to ${destination}!`
        );
      } catch (err: any) {
        console.error(
          `[prefunding-transfers] Failed to transfer to ${destination}:`,
          err
        );
        await prisma.invoiceConnectedAccountTransfer.update({
          where: { id: transfer.id },
          data: {
            status: "FAILED",
            failureMessage: err?.message || "Stripe transfer failed in prefunding cron job",
          },
        });
      }
    }
  } catch (error) {
    console.error("[prefunding-transfers] Critical error in prefunding transfer job:", error);
  }
}

export function startPrefundingTransfersJob(
  cronExpression: string = "0 * * * *", // Runs at minute 0 of every hour
) {
  cron.schedule(cronExpression, async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await processPendingPrefundingTransfers();
    } catch (error) {
      console.error("[prefunding-transfers] Failed to process prefunding transfers:", error);
    } finally {
      isRunning = false;
    }
  });

  console.log(
    `[prefunding-transfers] Job scheduled with cron expression: "${cronExpression}"`
  );
}
