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
import { generateReceiptPdfBufferFromDb } from "../../utils/receiptPdf";
import { uploadInvoiceReceiptBufferToAzureBlob } from "../../utils/invoiceReceiptBlob";
import { generateInvoicePdfBuffer } from "../../utils/invoicePdf";

function toStripeMinorUnit(amount: number | string) {
  return Math.round(Number(amount) * 100);
}

function normalizeStripeCurrency(currency?: string | null) {
  return (currency || "USD").toLowerCase();
}

function buildPdfFolder(prefix: string, date: Date, invoiceNumber?: string | null) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const safeInvoice = (invoiceNumber || "invoice").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${prefix}/${year}/${month}/${day}/${safeInvoice}`;
}

function buildBillingRunInvoicePreview(run: any) {
  const currency = (run.practice?.defaultCurrency || "USD").toUpperCase();
  const lineItems = (run.items || []).map((item: any) => ({
    description: item.service?.name || "Service",
    quantity: 1,
    unitPrice: Number(item.clientAmount || 0),
    totalPrice: Number(item.clientAmount || 0),
  }));

  return {
    invoiceNumber: `Preview-${run.id.slice(0, 8).toUpperCase()}`,
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    totalAmount: Number(
      (run.items || []).reduce((sum: number, item: any) => sum + Number(item.clientAmount || 0), 0),
    ),
    subtotalAmount: null,
    taxAmount: 0,
    discountAmount: 0,
    currency,
    lineItems,
    practiceInfo: {
      name: run.practice?.name || "Tristate MSO",
      address: run.practice?.company?.address || "",
      city: run.practice?.company?.city || "",
      state: run.practice?.company?.state || "",
      zipCode: run.practice?.company?.zipCode || "",
      email: run.practice?.company?.email || "",
      phone: run.practice?.company?.phone || "",
    },
  };
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

  const hasCreditCardChargesService = invoice.lineItems.some((item) => {
    const name = (item.service?.name || "").toLowerCase().replace(/\s/g, "");
    return name === "creditcardcharges";
  });

  const paymentMethodTypes = (hasCreditCardChargesService
    ? ["card"]
    : ["us_bank_account", "customer_balance"]) as any;

  const stripeInvoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    currency,
    auto_advance: false,
    collection_method: "send_invoice",
    due_date: invoice.dueDate
      ? Math.floor(invoice.dueDate.getTime() / 1000)
      : undefined,
    days_until_due: invoice.dueDate ? undefined : 30,
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
      customer: stripeCustomerId,
      invoice: stripeInvoice.id,
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

import { processAndEmailInvoice } from "../invoice/invoice";

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

    const rawAgreementIds = Array.isArray(req.query.agreementIds)
      ? req.query.agreementIds[0]
      : req.query.agreementIds;
    let agreementIds: string[] | undefined = undefined;
    if (typeof rawAgreementIds === "string") {
      agreementIds = rawAgreementIds.split(",").map((id) => id.trim()).filter(Boolean);
    }

    const readiness = await getBillingReadiness({
      practiceId,
      periodStart,
      periodEnd,
      agreementIds,
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

export async function getBillingRunInvoicePreviewHandler(
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
    if (
      billingRun.status === BillingRunStatus.POSTED ||
      billingRun.status === BillingRunStatus.CLOSED
    ) {
      return res.status(400).json({
        message: "Invoice preview is only available before posting.",
      });
    }

    const pdfBuffer = await generateInvoicePdfBuffer(
      buildBillingRunInvoicePreview(billingRun),
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="BillingRun-${billingRun.id.slice(0, 8)}-Preview.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({
      message: "Unable to generate billing run invoice preview.",
      error: error instanceof Error ? error.message : error,
    });
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

    if (result.invoices && result.invoices.length > 0) {
      for (const inv of result.invoices) {
        processAndEmailInvoice(inv.id).catch((err) => {
          console.error(`Error processing and emailing invoice ${inv.id}:`, err);
        });
      }
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

    for (const allocation of result.allocations || []) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: allocation.invoiceId },
      });
      if (!invoice) continue;
      try {
        const receiptBuffer = await generateReceiptPdfBufferFromDb(
          invoice.id,
          "manual",
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
      } catch (err) {
        console.error("[recordManualPayment] Failed to upload receipt PDF:", err);
      }
    }

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
