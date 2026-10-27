import { ExternalEntityType, ExternalSyncStatus, ExternalSystem, InvoiceStatus, PaymentStatus } from "../../../generated/prisma/client";
import type { Response, Request } from "express";
import { prisma } from "../../lib/prisma";
import {
  stripe,
  getStripeWebhookSecret,
} from "../../lib/stripe";
import { stripeRequest } from "../../lib/stripeApi";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { sendOutlookEmail } from "../../utils/outlook";
import { generateReceiptPdfBufferFromDb } from "../../utils/receiptPdf";
import { generatePrefundingInvoicePdfBuffer } from "../../utils/prefundingInvoicePdf";
import { wrapPrefundingEmailLayout } from "../../utils/prefundingEmailLayout";
import { uploadPrefundingInvoiceBufferToAzureBlob } from "../../utils/prefundingBlob";
import { uploadInvoiceReceiptBufferToAzureBlob } from "../../utils/invoiceReceiptBlob";
import {
  extractPaymentMethodInfo,
  sendInvoiceFirstEmail,
  sendPaymentReceiptEmail,
} from "../../utils/stripeEmailFlow";
import {
  getProcessingFeeDescription,
  getStripePaymentMethodTypes,
  isBillingPaymentMethod,
} from "../../utils/paymentProcessing";
import { getPrimaryPracticeEmail } from "../../utils/practiceEmail";

function normalizeCurrency(currency?: string | null) {
  return (currency || "USD").toLowerCase();
}

function toMinorUnit(amount: number | string) {
  return Math.round(Number(amount) * 100);
}

async function transferInvoiceLineItemsToConnectedAccounts(params: {
  invoice: {
    id: string;
    currency?: string | null;
    stripeInvoiceId?: string | null;
    lineItems: Array<{
      id: string;
      totalPrice: any;
      externalTotalPrice?: any;
      serviceId: string;
      stripeConnectedAccountId?: string | null;
      service?: {
        id: string;
        name: string;
        stripeConnectedAccountId?: string | null;
      } | null;
    }>;
  };
  sourceTransactionId?: string | null;
}) {
  const transferTotals = new Map<
    string,
    { amount: number; serviceIds: string[]; lineItemIds: string[] }
  >();

  for (const lineItem of params.invoice.lineItems) {
    const destination =
      lineItem.service?.stripeConnectedAccountId?.trim() ||
      lineItem.stripeConnectedAccountId?.trim();

    if (!destination) {
      console.warn(
        `Skipping Stripe transfer for invoice ${params.invoice.id} line item ${lineItem.id} because the service is missing a Stripe connected account id.`,
      );
      continue;
    }

    const amount = toMinorUnit(lineItem.externalTotalPrice ?? lineItem.totalPrice);
    const current = transferTotals.get(destination);
    if (current) {
      current.amount += amount;
      current.lineItemIds.push(lineItem.id);
      current.serviceIds.push(lineItem.serviceId);
    } else {
      transferTotals.set(destination, {
        amount,
        serviceIds: [lineItem.serviceId],
        lineItemIds: [lineItem.id],
      });
    }
  }

  const createdTransfers: Array<{ id: string }> = [];
  const currency = normalizeCurrency(params.invoice.currency);
  const transferGroup = params.invoice.stripeInvoiceId || params.invoice.id;
  const sourceTransactionId = params.sourceTransactionId?.trim() || null;

  if (!sourceTransactionId) {
    console.error(
      `Skipping Stripe connected account transfers for invoice ${params.invoice.id} because no source_transaction charge id was resolved from the paid invoice.`,
    );
    return createdTransfers;
  }

  // 1. Calculate total gross transfer amount needed across all destinations
  let totalGrossTransferAmount = 0;
  for (const transfer of transferTotals.values()) {
    totalGrossTransferAmount += transfer.amount;
  }

  // 2. Fetch current Stripe platform balance
  let availableBalanceAmount = totalGrossTransferAmount;
  try {
    const balanceResponse = await stripe.balance.retrieve();
    const availableObj = balanceResponse.available.find(
      (b) => b.currency.toLowerCase() === currency,
    );
    if (availableObj) {
      availableBalanceAmount = availableObj.amount;
    }
  } catch (balanceError) {
    console.error(
      `Failed to retrieve Stripe balance for invoice transfer ${params.invoice.id}, defaulting to planned gross amounts.`,
      balanceError,
    );
  }

  // 3. Compute available ratio if balance is lower than total transfer needed (e.g. negative balance deficit)
  const transferRatio =
    totalGrossTransferAmount > 0 && availableBalanceAmount < totalGrossTransferAmount
      ? Math.max(0, availableBalanceAmount) / totalGrossTransferAmount
      : 1;

  for (const [destination, transfer] of transferTotals.entries()) {
    const existingTransfer = await prisma.invoiceConnectedAccountTransfer.findUnique({
      where: {
        invoiceId_stripeConnectedAccountId: {
          invoiceId: params.invoice.id,
          stripeConnectedAccountId: destination,
        },
      },
    });

    if (existingTransfer?.status === "SENT" && existingTransfer.stripeTransferId) {
      continue;
    }

    // Apply proportional balance adjustment based on each account's share
    const adjustedAmount = Math.floor(transfer.amount * transferRatio);
    const storedAmount = Number((adjustedAmount / 100).toFixed(2));

    if (adjustedAmount <= 0) {
      await prisma.invoiceConnectedAccountTransfer.upsert({
        where: {
          invoiceId_stripeConnectedAccountId: {
            invoiceId: params.invoice.id,
            stripeConnectedAccountId: destination,
          },
        },
        create: {
          invoiceId: params.invoice.id,
          stripeConnectedAccountId: destination,
          amount: storedAmount,
          currency: currency.toUpperCase(),
          status: "SKIPPED",
          failureMessage: "Net transfer amount is not positive after balance adjustments.",
          transferGroup,
          serviceIds: [...new Set(transfer.serviceIds)],
          invoiceLineItemIds: [...new Set(transfer.lineItemIds)],
        },
        update: {
          amount: storedAmount,
          currency: currency.toUpperCase(),
          status: "SKIPPED",
          failureMessage: "Net transfer amount is not positive after balance adjustments.",
          transferGroup,
          serviceIds: [...new Set(transfer.serviceIds)],
          invoiceLineItemIds: [...new Set(transfer.lineItemIds)],
          stripeTransferId: null,
        },
      });
      console.warn(
        `Skipping Stripe transfer for invoice ${params.invoice.id} destination ${destination} because the net transfer amount is not positive after balance adjustments: ${adjustedAmount}.`,
      );
      continue;
    }

    await prisma.invoiceConnectedAccountTransfer.upsert({
      where: {
        invoiceId_stripeConnectedAccountId: {
          invoiceId: params.invoice.id,
          stripeConnectedAccountId: destination,
        },
      },
      create: {
        invoiceId: params.invoice.id,
        stripeConnectedAccountId: destination,
        amount: storedAmount,
        currency: currency.toUpperCase(),
        status: "PENDING",
        failureMessage: null,
        transferGroup,
        serviceIds: [...new Set(transfer.serviceIds)],
        invoiceLineItemIds: [...new Set(transfer.lineItemIds)],
      },
      update: {
        amount: storedAmount,
        currency: currency.toUpperCase(),
        status: "PENDING",
        failureMessage: null,
        transferGroup,
        serviceIds: [...new Set(transfer.serviceIds)],
        invoiceLineItemIds: [...new Set(transfer.lineItemIds)],
        stripeTransferId: null,
      },
    });

    console.info(
      `Saved Stripe transfer ${storedAmount} as PENDING for invoice ${params.invoice.id} to destination ${destination}. It will be processed automatically by the daily Cron Job once the funds become available.`
    );
  }

  return createdTransfers;
}

export async function transferPrefundingInvoiceToConnectedAccount(params: {
  prefundingInvoice: {
    id: string;
    currency?: string | null;
    stripeInvoiceId?: string | null;
    totalAmount: any;
    subtotalAmount?: any;
    practice: {
      id: string;
      name: string;
      prefundingStripeAccountId?: string | null;
    };
  };
  sourceTransactionId?: string | null;
}) {
  const destination = params.prefundingInvoice.practice?.prefundingStripeAccountId?.trim();
  if (!destination) {
    console.warn(
      `Skipping Stripe transfer for Prefunding Invoice ${params.prefundingInvoice.id} because practice has no prefundingStripeAccountId.`
    );
    return;
  }

  const grossAmount = toMinorUnit(params.prefundingInvoice.subtotalAmount ?? params.prefundingInvoice.totalAmount);
  if (grossAmount <= 0) {
    return;
  }

  const currency = normalizeCurrency(params.prefundingInvoice.currency);
  const transferGroup = params.prefundingInvoice.stripeInvoiceId || params.prefundingInvoice.id;
  const storedAmount = Number((grossAmount / 100).toFixed(2));

  // Check if transfer already exists (SENT, PENDING, or FAILED)
  const existingTransfers = await prisma.invoiceConnectedAccountTransfer.findMany({
    where: {
      prefundingInvoiceId: params.prefundingInvoice.id,
      stripeConnectedAccountId: destination,
    },
    orderBy: { createdAt: "asc" },
  });

  if (existingTransfers.some((t) => t.status === "SENT" && t.stripeTransferId)) {
    // If there are duplicate pending transfers alongside a completed one, remove the pending duplicates
    const pendingDups = existingTransfers.filter((t) => t.status === "PENDING" && !t.stripeTransferId);
    if (pendingDups.length > 0) {
      await prisma.invoiceConnectedAccountTransfer.deleteMany({
        where: { id: { in: pendingDups.map((d) => d.id) } },
      });
    }
    return;
  }

  const existingTransfer = existingTransfers[0];

  if (existingTransfer) {
    await prisma.invoiceConnectedAccountTransfer.update({
      where: { id: existingTransfer.id },
      data: {
        amount: storedAmount,
        currency: currency.toUpperCase(),
        status: "PENDING",
        failureMessage: null,
        transferGroup,
      },
    });

    // Remove any accidental duplicate pending rows
    if (existingTransfers.length > 1) {
      const extraIds = existingTransfers.slice(1).map((t) => t.id);
      await prisma.invoiceConnectedAccountTransfer.deleteMany({
        where: { id: { in: extraIds } },
      });
    }
  } else {
    try {
      await prisma.invoiceConnectedAccountTransfer.create({
        data: {
          prefundingInvoiceId: params.prefundingInvoice.id,
          stripeConnectedAccountId: destination,
          amount: storedAmount,
          currency: currency.toUpperCase(),
          status: "PENDING",
          failureMessage: null,
          transferGroup,
        },
      });
    } catch (createErr: any) {
      console.warn("Transfer record already created concurrently:", createErr?.message);
    }
  }

  console.info(
    `Saved Stripe transfer ${storedAmount} as PENDING for Prefunding Invoice ${params.prefundingInvoice.id} to practice Connected Account ${destination}.`
  );
}

type StripeConnectedAccountSummary = {
  id: string;
  displayName: string;
  email: string | null;
  country: string | null;
  defaultCurrency: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDisabledReason: string | null;
  businessProfile: {
    name: string | null;
    url: string | null;
  };
};

function serializeStripeAccount(account: any): StripeConnectedAccountSummary {
  const rawDisplayName =
    account.business_profile?.name ||
    account.company?.name ||
    [account.individual?.first_name, account.individual?.last_name]
      .filter(Boolean)
      .join(" ") ||
    account.display_name ||
    account.settings?.dashboard?.display_name ||
    account.email ||
    account.id;

  const displayName = String(rawDisplayName)
    .replace(/\s*[|│â”‚]+\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    id: account.id,
    displayName,
    email: account.email ?? null,
    country: account.country ?? null,
    defaultCurrency: account.default_currency ?? null,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    requirementsDisabledReason: account.requirements?.disabled_reason ?? null,
    businessProfile: {
      name: account.business_profile?.name ?? null,
      url: account.business_profile?.url ?? null,
    },
  };
}

export async function listStripeConnectedAccounts(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const accounts = await stripe.accounts.list({ limit: 100 });

    return res.status(200).json({
      message: "Stripe connected accounts fetched successfully.",
      accounts: accounts.data
        .filter((account) => !account.deleted)
        .filter((account) => account.details_submitted || account.charges_enabled || account.payouts_enabled)
        .map((account) => serializeStripeAccount(account))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch Stripe connected accounts.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getStripeConnectedAccount(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const accountId = Array.isArray(req.params.accountId)
      ? req.params.accountId[0]
      : req.params.accountId;

    if (!accountId) {
      return res.status(400).json({ message: "accountId is required." });
    }

    const account = await stripe.accounts.retrieve(accountId);
    if ((account as any).deleted) {
      return res.status(404).json({
        message: "Stripe connected account not found.",
      });
    }

    return res.status(200).json({
      message: "Stripe connected account fetched successfully.",
      account: serializeStripeAccount(account),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch Stripe connected account.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

function buildPdfFolder(prefix: string, date: Date, invoiceNumber?: string | null) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const safeInvoice = (invoiceNumber || "invoice").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${prefix}/${year}/${month}/${day}/${safeInvoice}`;
}

async function createSyncJob(params: {
  entityType: ExternalEntityType;
  entityId: string;
  externalId?: string | null;
  status?: ExternalSyncStatus;
  payload?: unknown;
  lastError?: string | null;
}) {
  return prisma.externalSyncJob.create({
    data: {
      system: ExternalSystem.STRIPE,
      entityType: params.entityType,
      entityId: params.entityId,
      externalId: params.externalId ?? undefined,
      status: params.status ?? ExternalSyncStatus.PENDING,
      payload: params.payload as any,
      lastError: params.lastError ?? undefined,
    },
  });
}

async function addSyncAttempt(
  externalSyncJobId: string,
  params: {
    status: ExternalSyncStatus;
    requestPayload?: unknown;
    responsePayload?: unknown;
    errorMessage?: string | null;
  },
) {
  return prisma.externalSyncAttempt.create({
    data: {
      externalSyncJobId,
      status: params.status,
      requestPayload: params.requestPayload as any,
      responsePayload: params.responsePayload as any,
      errorMessage: params.errorMessage ?? undefined,
    },
  });
}

async function upsertStripeCustomerForPractice(practiceId: string) {
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    include: {
      persons: {
        include: {
          person: true,
        },
      },
      company: true,
      taxId: true,
      billToTaxId: true,
    },
  });

  if (!practice) {
    throw new Error("Practice not found.");
  }

  if (practice.stripeCustomerId) {
    const customer = await stripe.customers.retrieve(practice.stripeCustomerId);
    if (!("deleted" in customer && customer.deleted)) {
      const primaryEmail = await getPrimaryPracticeEmail(practice);
      await stripe.customers.update(practice.stripeCustomerId, {
        name: practice.name,
        email: primaryEmail || undefined,
        metadata: {
          practiceId: practice.id,
          companyId: practice.companyId || "",
          taxIdId: practice.taxIdId || "",
          billToTaxIdId: practice.billToTaxIdId || "",
        },
      });
      return { practice, customer };
    }
  }

  const customer = await stripe.customers.create({
    name: practice.name,
    email: (await getPrimaryPracticeEmail(practice)) || undefined,
    metadata: {
      practiceId: practice.id,
      companyId: practice.companyId || "",
      taxIdId: practice.taxIdId || "",
      billToTaxIdId: practice.billToTaxIdId || "",
    },
  });

  await prisma.practice.update({
    where: { id: practice.id },
    data: { stripeCustomerId: customer.id },
  });

  return { practice, customer };
}

export async function syncStripeCustomer(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const practiceId = Array.isArray(req.params.practiceId)
      ? req.params.practiceId[0]
      : req.params.practiceId;

    if (!practiceId) {
      return res.status(400).json({ message: "practiceId is required." });
    }

    const syncJob = await createSyncJob({
      entityType: ExternalEntityType.CUSTOMER,
      entityId: practiceId,
      status: ExternalSyncStatus.IN_PROGRESS,
    });

    try {
      const { practice, customer } = await upsertStripeCustomerForPractice(
        practiceId,
      );

      await prisma.externalSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: ExternalSyncStatus.SYNCED,
          externalId: customer.id,
          lastSyncedAt: new Date(),
        },
      });

      await addSyncAttempt(syncJob.id, {
        status: ExternalSyncStatus.SYNCED,
        responsePayload: customer,
      });

      return res.status(200).json({
        message: "Stripe customer synced successfully.",
        practiceId: practice.id,
        stripeCustomerId: customer.id,
        customer,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await prisma.externalSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: ExternalSyncStatus.FAILED,
          lastError: message,
        },
      });
      await addSyncAttempt(syncJob.id, {
        status: ExternalSyncStatus.FAILED,
        errorMessage: message,
      });
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      message: "Unable to sync Stripe customer.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function syncStripeInvoice(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const invoiceId = Array.isArray(req.params.invoiceId)
      ? req.params.invoiceId[0]
      : req.params.invoiceId;

    if (!invoiceId) {
      return res.status(400).json({ message: "invoiceId is required." });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        practice: {
          include: {
            company: true,
            taxId: true,
            billToTaxId: true,
          },
        },
        lineItems: {
          include: { service: true },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    if (invoice.lineItems.length === 0) {
      return res.status(400).json({
        message: "Invoice must have at least one line item before Stripe sync.",
      });
    }

    const syncJob = await createSyncJob({
      entityType: ExternalEntityType.INVOICE,
      entityId: invoice.id,
      externalId: invoice.stripeInvoiceId,
      status: ExternalSyncStatus.IN_PROGRESS,
    });

    try {
      const { customer } = await upsertStripeCustomerForPractice(invoice.practiceId);
      const currency = normalizeCurrency(invoice.currency || invoice.practice.defaultCurrency);

      if (!invoice.stripeInvoiceId) {
        const paymentMethod = isBillingPaymentMethod(invoice.paymentMethod)
          ? invoice.paymentMethod
          : "ACH";
        const paymentMethodTypes = getStripePaymentMethodTypes(paymentMethod) as any;

        const stripeInvoice = await stripe.invoices.create({
          customer: customer.id,
          currency,
          auto_advance: false,
          collection_method: "send_invoice",
          days_until_due: invoice.dueDate ? undefined : 30,
          due_date: invoice.dueDate
            ? Math.floor(invoice.dueDate.getTime() / 1000)
            : undefined,
          pending_invoice_items_behavior: "exclude",
          metadata: {
            localInvoiceId: invoice.id,
            practiceId: invoice.practiceId,
            agreementId: invoice.agreementId || "",
          },
          payment_settings: {
            payment_method_types: paymentMethodTypes,
          },
        });

        for (const lineItem of invoice.lineItems) {
          await stripe.invoiceItems.create({
            customer: customer.id,
            invoice: stripeInvoice.id,
            currency,
            amount: toMinorUnit(lineItem.totalPrice.toString()),
            description:
              lineItem.description ||
              lineItem.service.code ||
              lineItem.service.name,
            metadata: {
              localInvoiceId: invoice.id,
              localInvoiceLineItemId: lineItem.id,
              serviceId: lineItem.serviceId,
            },
          });
        }

        const processingFeeAmount = Number(invoice.processingFeeAmount || 0);
        if (processingFeeAmount > 0) {
          await stripe.invoiceItems.create({
            customer: customer.id,
            invoice: stripeInvoice.id,
            currency,
            amount: toMinorUnit(processingFeeAmount),
            description: getProcessingFeeDescription(paymentMethod),
            metadata: {
              localInvoiceId: invoice.id,
              itemType: "processing_fee",
            },
          });
        }

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            stripeInvoiceId: stripeInvoice.id,
            stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
            stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
          },
        });

        await prisma.externalSyncJob.update({
          where: { id: syncJob.id },
          data: {
            status: ExternalSyncStatus.SYNCED,
            externalId: stripeInvoice.id,
            lastSyncedAt: new Date(),
          },
        });

        await addSyncAttempt(syncJob.id, {
          status: ExternalSyncStatus.SYNCED,
          responsePayload: stripeInvoice,
        });

        return res.status(200).json({
          message: "Stripe invoice synced successfully.",
          stripeInvoice,
        });
      }

      const stripeInvoice = await stripe.invoices.retrieve(invoice.stripeInvoiceId);

      await prisma.externalSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: ExternalSyncStatus.SYNCED,
          externalId: stripeInvoice.id,
          lastSyncedAt: new Date(),
        },
      });

      await addSyncAttempt(syncJob.id, {
        status: ExternalSyncStatus.SYNCED,
        responsePayload: stripeInvoice,
      });

      return res.status(200).json({
        message: "Invoice already linked to Stripe.",
        stripeInvoice,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await prisma.externalSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: ExternalSyncStatus.FAILED,
          lastError: message,
        },
      });
      await addSyncAttempt(syncJob.id, {
        status: ExternalSyncStatus.FAILED,
        errorMessage: message,
      });
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      message: "Unable to sync invoice to Stripe.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function finalizeStripeInvoice(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const invoiceId = Array.isArray(req.params.invoiceId)
      ? req.params.invoiceId[0]
      : req.params.invoiceId;

    if (!invoiceId) {
      return res.status(400).json({ message: "invoiceId is required." });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });

    if (!invoice?.stripeInvoiceId) {
      return res.status(400).json({
        message: "Invoice is not yet linked to Stripe.",
      });
    }

    const stripeInvoice = await stripe.invoices.finalizeInvoice(invoice.stripeInvoiceId);

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
        stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
      },
    });

    return res.status(200).json({
      message: "Stripe invoice finalized successfully.",
      stripeInvoice,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to finalize Stripe invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function sendStripeInvoice(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const invoiceId = Array.isArray(req.params.invoiceId)
      ? req.params.invoiceId[0]
      : req.params.invoiceId;

    if (!invoiceId) {
      return res.status(400).json({ message: "invoiceId is required." });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });

    if (!invoice?.stripeInvoiceId) {
      return res.status(400).json({
        message: "Invoice is not yet linked to Stripe.",
      });
    }

    const stripeInvoice = await stripe.invoices.sendInvoice(invoice.stripeInvoiceId);

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.SENT,
        stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
        stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
      },
    });

    return res.status(200).json({
      message: "Stripe invoice sent successfully.",
      stripeInvoice,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to send Stripe invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function handleStripeWebhook(req: Request, res: Response) {
  try {
    const signature = req.headers["stripe-signature"];
    const webhookSecret = getStripeWebhookSecret();
    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ message: "Missing Stripe signature." });
    }

    if (!webhookSecret) {
      return res
        .status(500)
        .json({ message: "STRIPE_WEBHOOK_SECRET is not configured." });
    }

    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret,
    );

    await processStripeWebhookEvent(event);

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(400).json({
      message: "Stripe webhook handling failed.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

async function logStripeWebhookEvent(event: any, invoiceId: string) {
  try {
    const existing = await prisma.stripeEventLog.findFirst({
      where: { stripeEventId: event.id },
    });
    if (existing) return;

    let actionDescription = "Received Stripe Event";
    if (event.type === "invoice.finalized") {
      actionDescription = "Invoice finalized on Stripe";
    } else if (event.type === "invoice.sent") {
      actionDescription = "Invoice sent to client";
    } else if (event.type === "invoice.payment_failed") {
      actionDescription = "Payment failed on Stripe";
    } else if (event.type === "invoice.voided") {
      actionDescription = "Invoice voided on Stripe";
    } else if (event.type === "invoice.paid") {
      const amountPaid = Number(event.data.object.amount_paid || 0) / 100;
      actionDescription = `Invoice paid successfully via Stripe ($${amountPaid.toFixed(2)})`;
    } else if (event.type === "charge.succeeded") {
      const amountPaid = Number(event.data.object.amount || 0) / 100;
      actionDescription = `Payment charge of $${amountPaid.toFixed(2)} succeeded via Stripe`;
    }

    await prisma.stripeEventLog.create({
      data: {
        invoiceId,
        eventType: event.type,
        stripeEventId: event.id,
        stripeObjectType: event.data.object?.object || null,
        stripeObjectId: event.data.object?.id || null,
        payload: {
          action: actionDescription,
          stripePayload: event.data.object,
        },
        processedAt: new Date(),
        status: "PROCESSED",
      },
    });
  } catch (err) {
    console.error("Failed to log StripeEventLog:", err);
  }
}

async function processStripeWebhookEvent(event: any) {
  const alreadyProcessed = await prisma.stripeEventLog.findFirst({
    where: { stripeEventId: event.id },
  });

  if (alreadyProcessed) {
    return;
  }

  switch (event.type) {
    case "charge.succeeded": {
      const charge = event.data.object as any;
      let invoiceId = charge.invoice;

      if (!invoiceId && charge.payment_intent) {
        try {
          const pi: any = await stripe.paymentIntents.retrieve(
            charge.payment_intent as string,
            { expand: ["invoice"] }
          );
          invoiceId = typeof pi.invoice === "object" ? pi.invoice?.id : pi.invoice;
          if (!invoiceId && pi.payment_details?.order_reference) {
            invoiceId = pi.payment_details.order_reference;
          }
        } catch (piErr) {
          console.warn("Failed to retrieve payment intent for charge invoice lookup:", piErr);
        }
      }

      if (!invoiceId) {
        return;
      }

      const invoice = await prisma.invoice.findFirst({
        where: { stripeInvoiceId: invoiceId },
        include: {
          lineItems: {
            include: {
              service: true,
            },
          },
        },
      });

      if (!invoice) {
        // Check if this charge belongs to a Prefunding Invoice
        const prefundingInv = await prisma.prefundingInvoice.findFirst({
          where: { stripeInvoiceId: invoiceId },
          include: { practice: true },
        });

        if (prefundingInv) {
          const paymentMethodInfo = await extractPaymentMethodInfo(charge, undefined, stripe);
          const amountPaid = Number(charge.amount || 0) / 100;

          let dbPaymentMethod = "stripe";
          if (paymentMethodInfo.type === "credit_card") {
            dbPaymentMethod = `${paymentMethodInfo.brand || "Card"} ••••${paymentMethodInfo.last4 || ""}`;
          } else if (paymentMethodInfo.type === "ach") {
            dbPaymentMethod = `Bank Transfer (ACH) - ${paymentMethodInfo.bankName || "Bank"} (••••${paymentMethodInfo.last4 || ""})`;
          }

          const existingPayment = await prisma.payment.findFirst({
            where: {
              practiceId: prefundingInv.practiceId,
              stripePaymentIntentId: typeof charge.payment_intent === "string" ? charge.payment_intent : null,
            },
          });

          if (existingPayment) {
            await prisma.payment.update({
              where: { id: existingPayment.id },
              data: {
                paymentMethod: dbPaymentMethod,
                stripeChargeId: charge.id,
                externalReference: JSON.stringify({
                  type: paymentMethodInfo.type,
                  brand: paymentMethodInfo.brand,
                  last4: paymentMethodInfo.last4,
                  bankName: paymentMethodInfo.bankName,
                  isAch: paymentMethodInfo.isAch,
                }),
              },
            });
          } else {
            const payment = await prisma.payment.create({
              data: {
                practiceId: prefundingInv.practiceId,
                amount: amountPaid,
                currency: (charge.currency || prefundingInv.currency || "usd").toUpperCase(),
                status: PaymentStatus.ALLOCATED,
                paymentDate: new Date(charge.created * 1000),
                paymentMethod: dbPaymentMethod,
                stripePaymentIntentId: typeof charge.payment_intent === "string" ? charge.payment_intent : undefined,
                stripeChargeId: charge.id,
                externalReference: JSON.stringify({
                  type: paymentMethodInfo.type,
                  brand: paymentMethodInfo.brand,
                  last4: paymentMethodInfo.last4,
                  bankName: paymentMethodInfo.bankName,
                  isAch: paymentMethodInfo.isAch,
                }),
              },
            });

            await prisma.paymentAllocation.create({
              data: {
                paymentId: payment.id,
                prefundingInvoiceId: prefundingInv.id,
                allocatedAmount: amountPaid,
              },
            });
          }

          // Transfer funds to practice's prefundingStripeAccountId
          try {
            await transferPrefundingInvoiceToConnectedAccount({
              prefundingInvoice: prefundingInv,
              sourceTransactionId: charge.id,
            });
          } catch (tErr) {
            console.error(
              `Failed to transfer prefunding invoice ${prefundingInv.id} funds from charge.succeeded:`,
              tErr
            );
          }
          return;
        }

        console.warn("Invoice not found for charge.succeeded:", invoiceId);
        return;
      }

      await logStripeWebhookEvent(event, invoice.id);

      const paymentMethodInfo = await extractPaymentMethodInfo(charge, undefined, stripe);
      const amountPaid = Number(charge.amount || 0) / 100;

      // Format a nice human readable payment method name for the DB
      let dbPaymentMethod = "stripe";
      if (paymentMethodInfo.type === "credit_card") {
        dbPaymentMethod = `${paymentMethodInfo.brand || "Card"} ••••${paymentMethodInfo.last4 || ""}`;
      } else if (paymentMethodInfo.type === "ach") {
        dbPaymentMethod = `Bank Transfer (ACH) - ${paymentMethodInfo.bankName || "Bank"} (••••${paymentMethodInfo.last4 || ""})`;
      }

      const existingPayment = await prisma.payment.findFirst({
        where: {
          practiceId: invoice.practiceId,
          stripePaymentIntentId: typeof charge.payment_intent === "string" ? charge.payment_intent : null,
        },
      });

      if (existingPayment) {
        await prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            paymentMethod: dbPaymentMethod,
            stripeChargeId: charge.id,
            externalReference: JSON.stringify({
              type: paymentMethodInfo.type,
              brand: paymentMethodInfo.brand,
              last4: paymentMethodInfo.last4,
              bankName: paymentMethodInfo.bankName,
              isAch: paymentMethodInfo.isAch,
            }),
          },
        });
      } else {
        const payment = await prisma.payment.create({
          data: {
            practiceId: invoice.practiceId,
            amount: amountPaid,
            currency: (charge.currency || invoice.currency || "usd").toUpperCase(),
            status: PaymentStatus.ALLOCATED,
            paymentDate: new Date(charge.created * 1000),
            paymentMethod: dbPaymentMethod,
            stripePaymentIntentId: typeof charge.payment_intent === "string" ? charge.payment_intent : undefined,
            stripeChargeId: charge.id,
            externalReference: JSON.stringify({
              type: paymentMethodInfo.type,
              brand: paymentMethodInfo.brand,
              last4: paymentMethodInfo.last4,
              bankName: paymentMethodInfo.bankName,
              isAch: paymentMethodInfo.isAch,
            }),
          },
        });

        await prisma.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            allocatedAmount: amountPaid,
          },
        });
      }

      try {
        await transferInvoiceLineItemsToConnectedAccounts({
          invoice,
          sourceTransactionId: charge.id,
        });
      } catch (transferErr) {
        console.error(
          `Failed to transfer invoice ${invoice.id} funds from charge.succeeded using source_transaction ${charge.id}:`,
          transferErr,
        );
      }
      return;
    }

    case "invoice.finalized": {
      const stripeInvoice = event.data.object as any;
      if (!stripeInvoice.id) return;

      const invoice = await prisma.invoice.findFirst({
        where: { stripeInvoiceId: stripeInvoice.id },
      });
      if (invoice) {
        await logStripeWebhookEvent(event, invoice.id);
      }

      await prisma.invoice.updateMany({
        where: { stripeInvoiceId: stripeInvoice.id },
        data: {
          stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
          stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
        },
      });
      return;
    }

    case "invoice.sent": {
      const stripeInvoice = event.data.object as any;
      if (!stripeInvoice.id) return;

      const invoice = await prisma.invoice.findFirst({
        where: { stripeInvoiceId: stripeInvoice.id },
      });
      if (invoice) {
        await logStripeWebhookEvent(event, invoice.id);
      }

      await prisma.invoice.updateMany({
        where: { stripeInvoiceId: stripeInvoice.id },
        data: {
          status: InvoiceStatus.SENT,
          stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
          stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
        },
      });
      return;
    }

    case "invoice.payment_failed": {
      const stripeInvoice = event.data.object as any;
      if (!stripeInvoice.id) return;

      const invoice = await prisma.invoice.findFirst({
        where: { stripeInvoiceId: stripeInvoice.id },
      });
      if (invoice) {
        await logStripeWebhookEvent(event, invoice.id);
      }

      await prisma.invoice.updateMany({
        where: { stripeInvoiceId: stripeInvoice.id },
        data: { status: InvoiceStatus.OVERDUE },
      });
      return;
    }

    case "invoice.voided": {
      const stripeInvoice = event.data.object as any;
      if (!stripeInvoice.id) return;

      const invoice = await prisma.invoice.findFirst({
        where: { stripeInvoiceId: stripeInvoice.id },
      });
      if (invoice) {
        await logStripeWebhookEvent(event, invoice.id);
      }

      await prisma.invoice.updateMany({
        where: { stripeInvoiceId: stripeInvoice.id },
        data: { status: InvoiceStatus.CANCELLED },
      });
      return;
    }

    case "invoice.paid": {
      const stripeInvoice = event.data.object as any;
      if (!stripeInvoice.id) return;

      const invoice = await prisma.invoice.findFirst({
        where: { stripeInvoiceId: stripeInvoice.id },
        include: {
          lineItems: {
            include: {
              service: true,
            },
          },
        },
      });

      if (!invoice) {
        // Check if this invoice is a Prefunding Invoice
        const prefundingInv = await prisma.prefundingInvoice.findFirst({
          where: { stripeInvoiceId: stripeInvoice.id },
          include: { practice: true },
        });

        if (prefundingInv) {
          await prisma.prefundingInvoice.update({
            where: { id: prefundingInv.id },
            data: {
              status: "Paid",
              stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
              stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
            },
          });

          // Retrieve fully expanded Stripe invoice to get payments/charges/payment_intent
          let stripeInvoiceWithPayments = stripeInvoice;
          try {
            stripeInvoiceWithPayments = await stripe.invoices.retrieve(stripeInvoice.id, {
              expand: ["charge", "payment_intent", "payments.data.payment.payment_intent"],
            });
          } catch (rInvErr) {
            console.warn("Failed to retrieve expanded invoice in prefunding invoice.paid:", rInvErr);
          }

          let chargeId =
            typeof stripeInvoiceWithPayments.charge === "string"
              ? stripeInvoiceWithPayments.charge
              : (stripeInvoiceWithPayments.charge?.id || undefined);

          let piObj: any =
            stripeInvoiceWithPayments.payment_intent && typeof stripeInvoiceWithPayments.payment_intent === "object"
              ? stripeInvoiceWithPayments.payment_intent
              : undefined;

          let piId =
            typeof stripeInvoiceWithPayments.payment_intent === "string"
              ? stripeInvoiceWithPayments.payment_intent
              : (stripeInvoiceWithPayments.payment_intent?.id || undefined);

          // If no direct charge/pi, look in invoice.payments.data
          if (!chargeId && !piId && stripeInvoiceWithPayments.payments?.data?.length > 0) {
            const firstPayment = stripeInvoiceWithPayments.payments.data[0];
            const pObj = firstPayment.payment;
            if (pObj?.payment_intent) {
              if (typeof pObj.payment_intent === "object") {
                piObj = pObj.payment_intent;
                piId = piObj.id;
                chargeId = piObj.latest_charge || chargeId;
              } else if (typeof pObj.payment_intent === "string") {
                piId = pObj.payment_intent;
              }
            }
          }

          if (piId && !piObj) {
            try {
              piObj = await stripe.paymentIntents.retrieve(piId);
              if (piObj?.latest_charge && !chargeId) {
                chargeId = typeof piObj.latest_charge === "string" ? piObj.latest_charge : piObj.latest_charge.id;
              }
            } catch (piErr) {
              console.warn("Failed to retrieve payment intent for prefunding invoice:", piErr);
            }
          }

          let chargeObj: any =
            stripeInvoiceWithPayments.charge && typeof stripeInvoiceWithPayments.charge === "object"
              ? stripeInvoiceWithPayments.charge
              : undefined;

          if (chargeId && !chargeObj) {
            try {
              chargeObj = await stripe.charges.retrieve(chargeId);
            } catch (cErr) {
              console.warn("Failed to retrieve charge for prefunding invoice:", cErr);
            }
          }

          let paymentMethodInfo = { type: "stripe" } as any;
          try {
            paymentMethodInfo = await extractPaymentMethodInfo(chargeObj, piObj, stripe);
          } catch (pmErr) {
            console.warn("Failed to extract pm info for prefunding invoice:", pmErr);
          }

          const amountPaid = Number(stripeInvoice.amount_paid || 0) / 100;
          let dbPaymentMethod = "stripe";
          if (paymentMethodInfo.type === "credit_card") {
            dbPaymentMethod = `${paymentMethodInfo.brand || "Card"} ••••${paymentMethodInfo.last4 || ""}`;
          } else if (paymentMethodInfo.type === "ach") {
            dbPaymentMethod = `Bank Transfer (ACH) - ${paymentMethodInfo.bankName || "Bank"} (••••${paymentMethodInfo.last4 || ""})`;
          } else if (prefundingInv.paymentMethod === "ACH") {
            dbPaymentMethod = "Bank Transfer (ACH)";
          } else if (prefundingInv.paymentMethod === "CREDIT_CARD") {
            dbPaymentMethod = "Credit Card";
          }

          const existingPayment = await prisma.payment.findFirst({
            where: {
              allocations: {
                some: { prefundingInvoiceId: prefundingInv.id },
              },
            },
          });

          if (!existingPayment) {
            const payment = await prisma.payment.create({
              data: {
                practiceId: prefundingInv.practiceId,
                amount: amountPaid,
                currency: (stripeInvoice.currency || prefundingInv.currency || "usd").toUpperCase(),
                status: PaymentStatus.ALLOCATED,
                paymentDate: stripeInvoice.status_transitions?.paid_at
                  ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
                  : new Date(),
                paymentMethod: dbPaymentMethod,
                stripePaymentIntentId: piId,
                stripeChargeId: chargeId,
                externalReference: JSON.stringify({
                  type: paymentMethodInfo.type,
                  brand: paymentMethodInfo.brand,
                  last4: paymentMethodInfo.last4,
                  bankName: paymentMethodInfo.bankName,
                  isAch: paymentMethodInfo.isAch,
                }),
              },
            });

            await prisma.paymentAllocation.create({
              data: {
                paymentId: payment.id,
                prefundingInvoiceId: prefundingInv.id,
                allocatedAmount: amountPaid,
              },
            });
          } else {
            // Update existing payment with the rich details if it was previously generic "stripe"
            if (existingPayment.paymentMethod === "stripe" && dbPaymentMethod !== "stripe") {
              await prisma.payment.update({
                where: { id: existingPayment.id },
                data: {
                  paymentMethod: dbPaymentMethod,
                  stripePaymentIntentId: piId || existingPayment.stripePaymentIntentId,
                  stripeChargeId: chargeId || existingPayment.stripeChargeId,
                  externalReference: JSON.stringify({
                    type: paymentMethodInfo.type,
                    brand: paymentMethodInfo.brand,
                    last4: paymentMethodInfo.last4,
                    bankName: paymentMethodInfo.bankName,
                    isAch: paymentMethodInfo.isAch,
                  }),
                },
              });
            }
          }

          // Transfer funds to practice's Prefunding Stripe Account
          try {
            await transferPrefundingInvoiceToConnectedAccount({
              prefundingInvoice: prefundingInv,
              sourceTransactionId: chargeId,
            });
          } catch (tErr) {
            console.error(
              `Failed to transfer prefunding invoice ${prefundingInv.id} to connected account on invoice.paid:`,
              tErr
            );
          }

          // Generate & Send Prefunding Payment Receipt Email
          try {
            const fullPrefundingInv = await prisma.prefundingInvoice.findUnique({
              where: { id: prefundingInv.id },
              include: {
                practice: {
                  include: {
                    persons: { include: { person: true } },
                  },
                },
                lineItems: { orderBy: { sequence: "asc" } },
              },
            });

            if (fullPrefundingInv) {
              const recipientEmails: string[] = [];
              if (fullPrefundingInv.practice.prefundingInvoiceRecipientId) {
                const recPerson = await prisma.person.findUnique({
                  where: { id: fullPrefundingInv.practice.prefundingInvoiceRecipientId },
                  select: { email: true, firstName: true, lastName: true },
                });
                if (recPerson?.email && recPerson.email.includes("@")) {
                  recipientEmails.push(recPerson.email.trim());
                }
              }

              if (recipientEmails.length === 0) {
                const pEmail = await getPrimaryPracticeEmail(fullPrefundingInv.practice as any);
                if (pEmail) recipientEmails.push(pEmail);
              }

              const uniqueReceiptEmails = [...new Set(recipientEmails)];

              if (uniqueReceiptEmails.length > 0) {
                const firstPerson = fullPrefundingInv.practice?.persons?.[0]?.person;
                const recipientName = firstPerson ? `${firstPerson.firstName} ${firstPerson.lastName}`.trim() : undefined;
                const recipientEmail = firstPerson?.email || undefined;
                const invNum = fullPrefundingInv.invoiceNumber || `INV-${fullPrefundingInv.id.slice(0, 8)}`;
                const receiptNum = `RCP-${invNum}`;

                const receiptPdfBuffer = await generatePrefundingInvoicePdfBuffer({
                  invoiceNumber: invNum,
                  invoiceDate: fullPrefundingInv.invoiceDate,
                  dueDate: fullPrefundingInv.dueDate,
                  cycle: fullPrefundingInv.cycle,
                  totalAmount: Number(fullPrefundingInv.totalAmount),
                  subtotalAmount: fullPrefundingInv.subtotalAmount ? Number(fullPrefundingInv.subtotalAmount) : Number(fullPrefundingInv.totalAmount),
                  processingFeeAmount: fullPrefundingInv.processingFeeAmount ? Number(fullPrefundingInv.processingFeeAmount) : 0,
                  status: "PAID",
                  paymentMethod: dbPaymentMethod,
                  paidDate: new Date(),
                  practice: fullPrefundingInv.practice as any,
                  recipientName,
                  recipientEmail,
                  lineItems: (fullPrefundingInv.lineItems || []).map((item: any) => ({
                    ...item,
                    rate: item.rate !== null ? Number(item.rate) : null,
                    amount: Number(item.amount),
                    includeInGrandTotal: item.includeInGrandTotal !== false,
                    sequence: item.sequence ?? 0,
                  })),
                });

                // Store Payment Receipt PDF in Azure Blob Storage
                try {
                  const now = new Date();
                  const year = String(now.getFullYear());
                  const month = String(now.getMonth() + 1).padStart(2, "0");
                  const day = String(now.getDate()).padStart(2, "0");
                  const safeInvoice = (invNum || fullPrefundingInv.id).replace(/[^a-zA-Z0-9._-]/g, "_");
                  const receiptFolder = `receipts/${year}/${month}/${day}/${safeInvoice}`;

                  const receiptUpload = await uploadPrefundingInvoiceBufferToAzureBlob({
                    folder: receiptFolder,
                    fileName: `Receipt-${safeInvoice}.pdf`,
                    buffer: receiptPdfBuffer,
                    contentType: "application/pdf",
                  });

                  await prisma.prefundingInvoice.update({
                    where: { id: fullPrefundingInv.id },
                    data: { receiptPdfBlobUrl: receiptUpload.url } as any,
                  });
                  console.log(`[stripeWebhook] Stored Prefunding receipt PDF in Azure Blob: ${receiptUpload.url}`);
                } catch (rBlobErr) {
                  console.error("[stripeWebhook] Failed to upload receipt PDF to Azure blob:", rBlobErr);
                }

                const receiptContentHtml = `
                  <p style="margin: 0 0 14px 0; font-size: 16px; line-height: 24px; color: #0f2d46; font-weight: 700;">
                    Hello ${fullPrefundingInv.practice.name},
                  </p>
                  <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 22px; color: #475569;">
                    Thank you for your payment. This email confirms that Prefunding Invoice <strong>#${invNum}</strong> (Cycle: <strong>${fullPrefundingInv.cycle}</strong>) has been successfully paid and settled.
                  </p>

                  <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 18px 20px; margin: 20px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <span style="font-size: 11px; text-transform: uppercase; color: #166534; font-weight: 700; display: block; letter-spacing: 0.05em;">Amount Paid</span>
                          <span style="font-size: 24px; font-weight: 900; color: #15803d; margin-top: 2px; display: block;">${amountPaid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </td>
                        <td align="right" valign="middle">
                          <span style="display: inline-block; background-color: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 6px 14px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
                            ✓ PAID
                          </span>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 20px; font-size: 13px;">
                    <tr>
                      <td style="padding: 10px 16px; color: #64748b;">Receipt Number:</td>
                      <td style="padding: 10px 16px; text-align: right; font-weight: 600; color: #0f172a;">${receiptNum}</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 16px; color: #64748b; border-top: 1px solid #edf2f7;">Payment Method:</td>
                      <td style="padding: 10px 16px; text-align: right; font-weight: 600; color: #0f172a; border-top: 1px solid #edf2f7;">${dbPaymentMethod}</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 16px; color: #64748b; border-top: 1px solid #edf2f7;">Paid Date:</td>
                      <td style="padding: 10px 16px; text-align: right; font-weight: 600; color: #0f172a; border-top: 1px solid #edf2f7;">${new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}</td>
                    </tr>
                  </table>

                  <p style="margin: 0; font-size: 13px; line-height: 20px; color: #64748b;">
                    📎 <strong>Receipt Attached:</strong> Your official payment receipt PDF (<strong>${receiptNum}.pdf</strong>) is attached to this email for your financial and tax records.
                  </p>
                `;

                const receiptEmailBody = wrapPrefundingEmailLayout({
                  title: "Payment Receipt Confirmation",
                  subtitle: "Tristate MSO Prefunding Department",
                  preheader: `Payment receipt for Prefunding Invoice #${invNum}. Amount paid: ${amountPaid.toFixed(2)}.`,
                  contentHtml: receiptContentHtml,
                  invoiceNumber: invNum,
                });

                const receiptFileName = `Receipt-${invNum}.pdf`;

                for (const toEmail of uniqueReceiptEmails) {
                  try {
                    await sendOutlookEmail(toEmail, `Payment Received - Receipt #${receiptNum}`, receiptEmailBody, {
                      attachments: [
                        {
                          name: receiptFileName,
                          contentType: "application/pdf",
                          contentBytes: receiptPdfBuffer.toString("base64"),
                        },
                      ],
                    });
                    console.log(`[stripeWebhook] Successfully sent Prefunding receipt email to ${toEmail}`);
                  } catch (eErr) {
                    console.error(`[stripeWebhook] Failed to send Prefunding receipt email to ${toEmail}:`, eErr);
                  }
                }
              }
            }
          } catch (rErr) {
            console.error(`Failed to generate or send receipt email for prefunding invoice ${prefundingInv.id}:`, rErr);
          }

          return;
        }

        return;
      }

      await logStripeWebhookEvent(event, invoice.id);

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status:
            stripeInvoice.amount_paid < stripeInvoice.amount_due
              ? InvoiceStatus.PARTIALLY_PAID
              : InvoiceStatus.PAID,
          stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
          stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
        },
      });

      try {
        const receiptBuffer = await generateReceiptPdfBufferFromDb(
          invoice.id,
          "stripe",
          undefined,
          prisma,
        );
        const upload = await uploadInvoiceReceiptBufferToAzureBlob({
          folder: buildPdfFolder("receipts", new Date(), invoice.invoiceNumber),
          fileName: `Receipt-${invoice.invoiceNumber || invoice.id}.pdf`,
          buffer: receiptBuffer,
          contentType: "application/pdf",
        });
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { receiptPdfBlobUrl: upload.url } as any,
        });
      } catch (receiptErr) {
        console.error("Failed to upload receipt PDF:", receiptErr);
      }

      // PRINCE TASK: Automate Vendor Payable Release
      // If the invoice is fully paid, release related vendor payables that are on hold
      if (stripeInvoice.amount_paid >= stripeInvoice.amount_due) {
        await prisma.vendorPayable.updateMany({
          where: {
            invoiceId: invoice.id,
            status: { in: ["APPROVED", "ON_HOLD", "DRAFT"] },
            releasePolicy: "ON_CLIENT_PAYMENT",
          },
          data: {
            status: "RELEASED",
            releasedAt: new Date(),
          },
        });
      }

      // Extract payment method details first
      let paymentMethodInfo = {
        type: "stripe",
      } as any;

      let stripeInvoiceObj = stripeInvoice;
      try {
        stripeInvoiceObj = await stripe.invoices.retrieve(stripeInvoice.id, {
          expand: ["charge", "payment_intent"],
        });
      } catch (retrieveErr) {
        console.warn("Failed to retrieve expanded invoice from Stripe:", retrieveErr);
      }

      let charge: any = (stripeInvoiceObj.charge && typeof stripeInvoiceObj.charge === "object") ? stripeInvoiceObj.charge : undefined;
      let pi: any = (stripeInvoiceObj.payment_intent && typeof stripeInvoiceObj.payment_intent === "object") ? stripeInvoiceObj.payment_intent : undefined;

      let chargeId = typeof stripeInvoiceObj.charge === "string" ? stripeInvoiceObj.charge : (stripeInvoiceObj.charge?.id || undefined);
      let piId = typeof stripeInvoiceObj.payment_intent === "string" ? stripeInvoiceObj.payment_intent : (stripeInvoiceObj.payment_intent?.id || undefined);

      if (piId && !pi) {
        try {
          pi = await stripe.paymentIntents.retrieve(piId);
        } catch (piErr) {
          console.warn("Failed to retrieve payment intent:", piErr);
        }
      }

      if (!charge && (chargeId || pi?.latest_charge)) {
        const idToRetrieve = chargeId || pi?.latest_charge;
        try {
          charge = await stripe.charges.retrieve(idToRetrieve as string);
          chargeId = charge?.id || chargeId;
        } catch (chargeErr) {
          console.warn("Failed to retrieve charge:", chargeErr);
        }
      }

      if (!chargeId && typeof charge?.id === "string") {
        chargeId = charge.id;
      }

      if (!chargeId) {
        const paymentWithCharge = await prisma.payment.findFirst({
          where: {
            allocations: {
              some: {
                invoiceId: invoice.id,
              },
            },
            stripeChargeId: {
              not: null,
            },
          },
          orderBy: { createdAt: "desc" },
          select: { stripeChargeId: true },
        });
        chargeId = paymentWithCharge?.stripeChargeId || chargeId;
      }

      try {
        await transferInvoiceLineItemsToConnectedAccounts({
          invoice,
          sourceTransactionId: chargeId,
        });
      } catch (transferErr) {
        console.error(
          `Failed to transfer invoice ${invoice.id} funds to connected accounts using source_transaction ${chargeId || "unknown"}:`,
          transferErr,
        );
      }

      try {
        paymentMethodInfo = await extractPaymentMethodInfo(charge, pi, stripe);
      } catch (err) {
        console.warn("Failed to extract payment method info:", err);
      }

      const amountPaid = Number(stripeInvoice.amount_paid || 0) / 100;
      if (amountPaid > 0) {
        const existingPayment = await prisma.payment.findFirst({
          where: {
            allocations: {
              some: {
                invoiceId: invoice.id,
              },
            },
          },
        });

        // Format a nice human readable payment method name for the DB
        let dbPaymentMethod = "stripe";
        if (paymentMethodInfo.type === "credit_card") {
          dbPaymentMethod = `${paymentMethodInfo.brand || "Card"} ••••${paymentMethodInfo.last4 || ""}`;
        } else if (paymentMethodInfo.type === "ach") {
          dbPaymentMethod = `Bank Transfer (ACH) - ${paymentMethodInfo.bankName || "Bank"} (••••${paymentMethodInfo.last4 || ""})`;
        } else if (paymentMethodInfo.type) {
          dbPaymentMethod = paymentMethodInfo.type;
        }

        if (!existingPayment) {

          const payment = await prisma.payment.create({
            data: {
              practiceId: invoice.practiceId,
              amount: amountPaid,
              currency: (stripeInvoice.currency || invoice.currency || "usd").toUpperCase(),
              status:
                stripeInvoice.amount_paid < stripeInvoice.amount_due
                  ? PaymentStatus.PARTIALLY_ALLOCATED
                  : PaymentStatus.ALLOCATED,
              paymentDate: stripeInvoice.status_transitions.paid_at
                ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
                : new Date(),
              paymentMethod: dbPaymentMethod,
              stripePaymentIntentId:
                typeof stripeInvoice.payment_intent === "string"
                  ? stripeInvoice.payment_intent
                  : undefined,
              stripeChargeId: typeof chargeId === "string" ? chargeId : undefined,
              externalReference: JSON.stringify({
                type: paymentMethodInfo.type,
                brand: paymentMethodInfo.brand,
                last4: paymentMethodInfo.last4,
                bankName: paymentMethodInfo.bankName,
                isAch: paymentMethodInfo.isAch,
              }),
            },
          });

          await prisma.paymentAllocation.create({
            data: {
              paymentId: payment.id,
              invoiceId: invoice.id,
              allocatedAmount: amountPaid,
            },
          });
        } else {
          if (existingPayment.paymentMethod === "stripe" && dbPaymentMethod !== "stripe") {
            await prisma.payment.update({
              where: { id: existingPayment.id },
              data: {
                paymentMethod: dbPaymentMethod,
                stripeChargeId: typeof chargeId === "string" ? chargeId : undefined,
                externalReference: JSON.stringify({
                  type: paymentMethodInfo.type,
                  brand: paymentMethodInfo.brand,
                  last4: paymentMethodInfo.last4,
                  bankName: paymentMethodInfo.bankName,
                  isAch: paymentMethodInfo.isAch,
                }),
              },
            });
          }
        }
      }

      // Send email flow
      try {
        const practice = await prisma.practice.findUnique({
          where: { id: invoice.practiceId },
          include: {
            persons: {
              include: {
                person: true,
              },
            },
            company: {
              include: {
                persons: {
                  include: {
                    person: true,
                  },
                },
              },
            },
          },
        });

        const emails: string[] = [];
        if (practice) {
          if (practice.persons) {
            for (const pp of practice.persons) {
              if (pp.person?.email && pp.person.email.includes("@")) {
                emails.push(pp.person.email.trim());
              }
            }
          }

          if (emails.length === 0) {
            const primaryEmail = await getPrimaryPracticeEmail(practice);
            if (primaryEmail) {
              emails.push(primaryEmail);
            }
          }
        }
        const uniqueEmails = [...new Set(emails)];

        // If paymentMethodInfo is generic "stripe", try to load rich details from the database payment record
        if (paymentMethodInfo.type === "stripe") {
          const dbPayment = await prisma.payment.findFirst({
            where: {
              allocations: {
                some: {
                  invoiceId: invoice.id,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          });

          if (dbPayment && dbPayment.externalReference) {
            try {
              const parsedInfo = JSON.parse(dbPayment.externalReference);
              if (parsedInfo && parsedInfo.type) {
                paymentMethodInfo = parsedInfo;
              }
            } catch (e) {
              console.warn("Failed to parse dbPayment externalReference:", e);
            }
          }
        }

        if (uniqueEmails.length > 0) {
          await sendPaymentReceiptEmail(uniqueEmails, invoice, invoice.invoiceNumber, stripeInvoice, paymentMethodInfo, prisma);
        } else {
          console.warn(`No recipients found for practice ${invoice.practiceId}`);
        }
      } catch (err) {
        console.error("Error in receipt email flow:", err);
      }

      return;
    }

    default:
      return;
  }
}
