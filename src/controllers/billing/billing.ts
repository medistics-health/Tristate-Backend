import {
  BillingRunStatus,
  InvoiceStatus,
} from "../../../generated/prisma/client";
import type { Response } from "express";
import type {
  CreateBillingRunBody,
  RecordPaymentBody,
  UpsertBillingSnapshotsBody,
} from "../../models/billing/billing";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  approveBillingRun,
  BillingServiceError,
  calculateBillingRun,
  createBillingRun,
  deleteBillingRun,
  getBillingReadiness,
  getBillingRun,
  importSnapshotsFromMonthlyReports,
  listBillingRuns,
  postBillingRun,
  recordManualPayment,
  upsertBillingRunSnapshots,
} from "../../services/billing/billing.service";
import { stripe } from "../../lib/stripe";
import { prisma } from "../../lib/prisma";

function toStripeMinorUnit(amount: number | string) {
  return Math.round(Number(amount) * 100);
}

function normalizeStripeCurrency(currency?: string | null) {
  return (currency || "USD").toLowerCase();
}

async function syncFinalizeAndSendInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      practice: { include: { company: true } },
      lineItems: { include: { service: true } },
    },
  });

  if (!invoice) {
    return { invoiceId, error: "Invoice not found." };
  }

  const currency = normalizeStripeCurrency(
    invoice.currency || invoice.practice?.defaultCurrency,
  );

  let stripeCustomerId = invoice.practice?.stripeCustomerId ?? null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      name: invoice.practice.name,
      email: invoice.practice.company?.email || undefined,
      metadata: { practiceId: invoice.practice.id },
    });
    stripeCustomerId = customer.id;
    await prisma.practice.update({
      where: { id: invoice.practice.id },
      data: { stripeCustomerId: customer.id },
    });
  }

  if (invoice.stripeInvoiceId) {
    return {
      invoiceId,
      stripeInvoiceId: invoice.stripeInvoiceId,
      status: "already_synced",
    };
  }

  for (const lineItem of invoice.lineItems) {
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      currency,
      amount: toStripeMinorUnit(lineItem.totalPrice.toString()),
      description:
        lineItem.description ||
        lineItem.service?.code ||
        lineItem.service?.name ||
        "Service",
      metadata: {
        localInvoiceId: invoice.id,
        localInvoiceLineItemId: lineItem.id,
        serviceId: lineItem.serviceId,
      },
    });
  }

  const stripeInvoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    currency,
    auto_advance: false,
    collection_method: "send_invoice",
    due_date: invoice.dueDate
      ? Math.floor(invoice.dueDate.getTime() / 1000)
      : undefined,
    days_until_due: invoice.dueDate ? undefined : 30,
    metadata: {
      localInvoiceId: invoice.id,
      practiceId: invoice.practiceId,
      agreementId: invoice.agreementId || "",
    },
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      stripeInvoiceId: stripeInvoice.id,
      stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
      stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
    },
  });

  await stripe.invoices.finalizeInvoice(stripeInvoice.id);
  const sent = await stripe.invoices.sendInvoice(stripeInvoice.id);

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: InvoiceStatus.SENT,
      stripeHostedInvoiceUrl: sent.hosted_invoice_url,
      stripeInvoicePdfUrl: sent.invoice_pdf,
    },
  });

  return { invoiceId, stripeInvoiceId: sent.id, status: "sent" };
}

function parseBillingRunStatus(value?: string) {
  if (!value) {
    return undefined;
  }

  return Object.values(BillingRunStatus).includes(value as BillingRunStatus)
    ? (value as BillingRunStatus)
    : null;
}

function handleBillingError(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof BillingServiceError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return res.status(500).json({
    message: fallbackMessage,
    error: error instanceof Error ? error.message : error,
  });
}

export async function createBillingRunHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRun = await createBillingRun(req.body as CreateBillingRunBody);

    return res.status(201).json({
      message: "Billing run created successfully.",
      billingRun,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to create billing run.");
  }
}

export async function getBillingReadinessHandler(
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
    const rawPeriodStart = Array.isArray(req.query.periodStart)
      ? req.query.periodStart[0]
      : req.query.periodStart;
    const rawPeriodEnd = Array.isArray(req.query.periodEnd)
      ? req.query.periodEnd[0]
      : req.query.periodEnd;
    const periodStart =
      typeof rawPeriodStart === "string" ? rawPeriodStart : undefined;
    const periodEnd = typeof rawPeriodEnd === "string" ? rawPeriodEnd : undefined;

    if (!practiceId || !periodStart || !periodEnd) {
      return res.status(400).json({
        message: "practiceId, periodStart and periodEnd are required.",
      });
    }

    const readiness = await getBillingReadiness({
      practiceId,
      periodStart,
      periodEnd,
    });

    return res.status(200).json({
      message: "Billing readiness fetched successfully.",
      readiness,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to fetch billing readiness.");
  }
}

export async function listBillingRunsHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const parsedStatus = parseBillingRunStatus(req.query.status as string | undefined);
    if ((req.query.status as string | undefined) && parsedStatus === null) {
      return res.status(400).json({
        message: "Invalid billing run status.",
        allowedStatuses: Object.values(BillingRunStatus),
      });
    }

    const response = await listBillingRuns({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      practiceId: (req.query.practiceId as string) || undefined,
      status: parsedStatus || undefined,
    });

    return res.status(200).json({
      message: "Billing runs fetched successfully.",
      ...response,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to fetch billing runs.");
  }
}

export async function getBillingRunHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRunId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!billingRunId) {
      return res.status(400).json({ message: "Billing run id is required." });
    }

    const billingRun = await getBillingRun(billingRunId);

    return res.status(200).json({
      message: "Billing run fetched successfully.",
      billingRun,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to fetch billing run.");
  }
}

export async function addBillingRunSnapshotsHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRunId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!billingRunId) {
      return res.status(400).json({ message: "Billing run id is required." });
    }

    const body = req.body as UpsertBillingSnapshotsBody;
    const snapshots = Array.isArray(body.snapshots) ? body.snapshots : [];

    const result = await upsertBillingRunSnapshots(
      billingRunId,
      snapshots,
      Boolean(body.replaceExisting),
    );

    return res.status(200).json({
      message: "Billing run snapshots saved successfully.",
      ...result,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to save billing run snapshots.");
  }
}

export async function calculateBillingRunHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRunId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!billingRunId) {
      return res.status(400).json({ message: "Billing run id is required." });
    }

    const billingRun = await calculateBillingRun(billingRunId);

    return res.status(200).json({
      message: "Billing run calculated successfully.",
      billingRun,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to calculate billing run.");
  }
}

export async function approveBillingRunHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRunId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!billingRunId) {
      return res.status(400).json({ message: "Billing run id is required." });
    }

    const billingRun = await approveBillingRun(billingRunId, req.user.sub);

    return res.status(200).json({
      message: "Billing run approved successfully.",
      billingRun,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to approve billing run.");
  }
}

export async function postBillingRunHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRunId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!billingRunId) {
      return res.status(400).json({ message: "Billing run id is required." });
    }

    const result = await postBillingRun(billingRunId, req.user.sub);

    if (req.body?.autoSyncStripe) {
      const stripeResults = await Promise.allSettled(
        result.invoices.map((invoice) => syncFinalizeAndSendInvoice(invoice.id)),
      );

      const stripeSync = stripeResults.map((outcome, index) => ({
        invoiceId: result.invoices[index].id,
        ...(outcome.status === "fulfilled"
          ? outcome.value
          : { error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) }),
      }));

      return res.status(200).json({
        message: "Billing run posted and invoices synced to Stripe.",
        ...result,
        stripeSync,
      });
    }

    return res.status(200).json({
      message: "Billing run posted successfully.",
      ...result,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to post billing run.");
  }
}

export async function importSnapshotsFromReportsHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRunId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!billingRunId) {
      return res.status(400).json({ message: "Billing run id is required." });
    }

    const replaceExisting = Boolean(req.body?.replaceExisting);

    const result = await importSnapshotsFromMonthlyReports(billingRunId, { replaceExisting });

    return res.status(200).json({
      message: "Snapshots imported from monthly reports successfully.",
      ...result,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to import snapshots from monthly reports.");
  }
}

export async function recordManualPaymentHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const result = await recordManualPayment(req.body as RecordPaymentBody);

    return res.status(201).json({
      message: "Payment recorded successfully.",
      ...result,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to record payment.");
  }
}

export async function deleteBillingRunHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRunId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!billingRunId) {
      return res.status(400).json({ message: "Billing run id is required." });
    }

    const result = await deleteBillingRun(billingRunId);

    return res.status(200).json({
      message: "Billing run deleted successfully.",
      ...result,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to delete billing run.");
  }
}
