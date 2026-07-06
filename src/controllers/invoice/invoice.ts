import { InvoiceStatus } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import { stripeRequest } from "../../lib/stripeApi";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { sendOutlookEmail } from "../../utils/outlook";
import { generateInvoicePdfBufferFromDb } from "../../utils/invoicePdf";
import {
  createInvoiceReceiptSasUrlFromBlobUrl,
  uploadInvoiceReceiptBufferToAzureBlob,
} from "../../utils/invoiceReceiptBlob";

type InvoiceBody = {
  practiceId?: string;
  agreementId?: string | null;
  totalAmount?: number;
  status?: string;
  dueDate?: string;
  invoiceNumber?: string | null;
  currency?: string | null;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
  subtotalAmount?: number | null;
  taxAmount?: number | null;
  discountAmount?: number | null;
  stripeInvoiceId?: string | null;
  stripeHostedInvoiceUrl?: string | null;
  stripeInvoicePdfUrl?: string | null;
  quickbooksInvoiceId?: string | null;
};

function buildPdfFolder(prefix: string, date: Date, invoiceNumber?: string | null) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const safeInvoice = (invoiceNumber || "invoice").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${prefix}/${year}/${month}/${day}/${safeInvoice}`;
}

function isInvoiceStatus(status: string): status is InvoiceStatus {
  return Object.values(InvoiceStatus).includes(status as InvoiceStatus);
}

async function ensureStripeCustomerForPractice(practice: {
  id: string;
  name: string;
  stripeCustomerId?: string | null;
  company?: { email?: string | null } | null;
}) {
  const fallbackEmail =
    practice.company?.email ||
    `billing@${practice.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
  const existingCustomerId = practice.stripeCustomerId?.trim();

  if (existingCustomerId) {
    try {
      await stripeRequest("GET", `/v1/customers/${existingCustomerId}`);
      return existingCustomerId;
    } catch (error: any) {
      const message = String(error?.message || "");
      if (!message.includes("No such customer")) {
        throw error;
      }
    }
  }

  const customer = await stripeRequest<{ id: string }>("POST", "/v1/customers", {
    name: practice.name,
    email: fallbackEmail,
    metadata: { practiceId: practice.id },
  });

  await prisma.practice.update({
    where: { id: practice.id },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export async function createInvoice(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      practiceId,
      agreementId,
      totalAmount,
      status,
      dueDate,
      invoiceNumber,
      currency,
      billingPeriodStart,
      billingPeriodEnd,
      subtotalAmount,
      taxAmount,
      discountAmount,
      stripeInvoiceId,
      stripeHostedInvoiceUrl,
      stripeInvoicePdfUrl,
      quickbooksInvoiceId,
    } = req.body as InvoiceBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!practiceId || totalAmount === undefined || !status) {
      return res.status(400).json({
        message: "practiceId, totalAmount and status are required.",
      });
    }

    if (!isInvoiceStatus(status)) {
      return res.status(400).json({
        message: "Invalid invoice status.",
        allowedStatuses: Object.values(InvoiceStatus),
      });
    }

    const practice = await prisma.practice.findFirst({
      where: { id: practiceId },
    });

    if (!practice) {
      return res.status(404).json({ message: "Practice not found." });
    }

    if (agreementId) {
      const agreement = await prisma.agreement.findFirst({
        where: {
          id: agreementId,
          practiceId,
        },
      });

      if (!agreement) {
        return res
          .status(404)
          .json({ message: "Agreement not found for practice." });
      }
    }

    let calculatedDueDate = dueDate ? new Date(dueDate) : undefined;
    if (!calculatedDueDate) {
      const settings = await prisma.systemSettings.findFirst();
      const dueDays = settings?.invoiceDueDays ?? 15;
      calculatedDueDate = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000);
    }

    const invoice = await prisma.invoice.create({
      data: {
        practiceId,
        agreementId: agreementId ?? undefined,
        totalAmount,
        status,
        dueDate: calculatedDueDate,
        ...(invoiceNumber !== undefined
          ? { invoiceNumber: invoiceNumber || null }
          : {}),
        ...(currency !== undefined ? { currency: currency || null } : {}),
        ...(billingPeriodStart !== undefined
          ? {
              billingPeriodStart: billingPeriodStart
                ? new Date(billingPeriodStart)
                : null,
            }
          : {}),
        ...(billingPeriodEnd !== undefined
          ? {
              billingPeriodEnd: billingPeriodEnd
                ? new Date(billingPeriodEnd)
                : null,
            }
          : {}),
        ...(subtotalAmount !== undefined ? { subtotalAmount } : {}),
        ...(taxAmount !== undefined ? { taxAmount } : {}),
        ...(discountAmount !== undefined ? { discountAmount } : {}),
        ...(stripeInvoiceId !== undefined
          ? { stripeInvoiceId: stripeInvoiceId || null }
          : {}),
        ...(stripeHostedInvoiceUrl !== undefined
          ? { stripeHostedInvoiceUrl: stripeHostedInvoiceUrl || null }
          : {}),
        ...(stripeInvoicePdfUrl !== undefined
          ? { stripeInvoicePdfUrl: stripeInvoicePdfUrl || null }
          : {}),
        ...(quickbooksInvoiceId !== undefined
          ? { quickbooksInvoiceId: quickbooksInvoiceId || null }
          : {}),
      },
    });

    try {
      const pdfBuffer = await generateInvoicePdfBufferFromDb(invoice.id, prisma);
      const upload = await uploadInvoiceReceiptBufferToAzureBlob({
        folder: buildPdfFolder("invoices", invoice.createdAt, invoice.invoiceNumber),
        fileName: `${invoice.invoiceNumber || invoice.id}.pdf`,
        buffer: pdfBuffer,
        contentType: "application/pdf",
      });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { invoicePdfBlobUrl: upload.url } as any,
      });
    } catch (pdfErr) {
      console.error("[createInvoice] Failed to upload invoice PDF:", pdfErr);
    }

    return res.status(201).json({
      message: "Invoice created successfully.",
      invoice: await prisma.invoice.findUnique({ where: { id: invoice.id } }),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getInvoice(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice id is required." });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id },
      include: {
        practice: true,
        agreement: true,
        lineItems: true,
        purchaseOrders: true,
        vendorPayables: true,
        paymentAllocations: {
          include: {
            payment: true,
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    return res.status(200).json({
      message: "Invoice fetched successfully.",
      invoice,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getInvoicePdf(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized." });
    if (!id) return res.status(400).json({ message: "Invoice id is required." });

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        invoicePdfBlobUrl: true,
        invoiceNumber: true,
        createdAt: true,
      },
    });
    if (!invoice) return res.status(404).json({ message: "Invoice not found." });

    if (invoice.invoicePdfBlobUrl) {
      const sasUrl = createInvoiceReceiptSasUrlFromBlobUrl(invoice.invoicePdfBlobUrl);
      return res.redirect(302, sasUrl);
    }

    const pdfBuffer = await generateInvoicePdfBufferFromDb(id, prisma);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${invoice.invoiceNumber || id}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch invoice PDF.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getInvoiceReceiptPdf(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized." });
    if (!id) return res.status(400).json({ message: "Invoice id is required." });

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        receiptPdfBlobUrl: true,
        invoiceNumber: true,
      },
    });
    if (!invoice) return res.status(404).json({ message: "Invoice not found." });

    if (invoice.receiptPdfBlobUrl) {
      const sasUrl = createInvoiceReceiptSasUrlFromBlobUrl(invoice.receiptPdfBlobUrl);
      return res.redirect(302, sasUrl);
    }

    return res.status(404).json({ message: "Receipt PDF not found." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch receipt PDF.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateInvoice(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const {
      agreementId,
      totalAmount,
      status,
      dueDate,
      invoiceNumber,
      currency,
      billingPeriodStart,
      billingPeriodEnd,
      subtotalAmount,
      taxAmount,
      discountAmount,
      stripeInvoiceId,
      stripeHostedInvoiceUrl,
      stripeInvoicePdfUrl,
      quickbooksInvoiceId,
    } = req.body as InvoiceBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice id is required." });
    }

    if (status !== undefined && !isInvoiceStatus(status)) {
      return res.status(400).json({
        message: "Invalid invoice status.",
        allowedStatuses: Object.values(InvoiceStatus),
      });
    }

    const existingInvoice = await prisma.invoice.findFirst({
      where: { id },
    });

    if (!existingInvoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    if (
      totalAmount !== undefined &&
      Number(totalAmount) !== Number(existingInvoice.totalAmount)
    ) {
      return res
        .status(400)
        .json({ message: "Editing totalAmount is not allowed." });
    }

    if (status !== undefined && status !== existingInvoice.status) {
      return res
        .status(400)
        .json({ message: "Editing status is not allowed." });
    }

    if (dueDate !== undefined && dueDate) {
      const parsedDueDate = new Date(dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsedDueDate < today) {
        return res
          .status(400)
          .json({ message: "Due date must be today or a future date." });
      }
    }

    if (agreementId) {
      const agreement = await prisma.agreement.findFirst({
        where: {
          id: agreementId,
          practiceId: existingInvoice.practiceId,
        },
      });

      if (!agreement) {
        return res
          .status(404)
          .json({ message: "Agreement not found for invoice." });
      }
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...(agreementId !== undefined
          ? { agreementId: agreementId || null }
          : {}),
        ...(totalAmount !== undefined ? { totalAmount } : {}),
        ...(status !== undefined ? { status: status as InvoiceStatus } : {}),
        ...(dueDate !== undefined
          ? { dueDate: dueDate ? new Date(dueDate) : null }
          : {}),
        ...(invoiceNumber !== undefined
          ? { invoiceNumber: invoiceNumber || null }
          : {}),
        ...(currency !== undefined ? { currency: currency || null } : {}),
        ...(billingPeriodStart !== undefined
          ? {
              billingPeriodStart: billingPeriodStart
                ? new Date(billingPeriodStart)
                : null,
            }
          : {}),
        ...(billingPeriodEnd !== undefined
          ? {
              billingPeriodEnd: billingPeriodEnd
                ? new Date(billingPeriodEnd)
                : null,
            }
          : {}),
        ...(subtotalAmount !== undefined ? { subtotalAmount } : {}),
        ...(taxAmount !== undefined ? { taxAmount } : {}),
        ...(discountAmount !== undefined ? { discountAmount } : {}),
        ...(stripeInvoiceId !== undefined
          ? { stripeInvoiceId: stripeInvoiceId || null }
          : {}),
        ...(stripeHostedInvoiceUrl !== undefined
          ? { stripeHostedInvoiceUrl: stripeHostedInvoiceUrl || null }
          : {}),
        ...(stripeInvoicePdfUrl !== undefined
          ? { stripeInvoicePdfUrl: stripeInvoicePdfUrl || null }
          : {}),
        ...(quickbooksInvoiceId !== undefined
          ? { quickbooksInvoiceId: quickbooksInvoiceId || null }
          : {}),
      },
    });

    return res.status(200).json({
      message: "Invoice updated successfully.",
      invoice,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteInvoice(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice id is required." });
    }

    const existingInvoice = await prisma.invoice.findFirst({
      where: { id },
    });

    if (!existingInvoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    await prisma.invoice.delete({ where: { id } });

    return res.status(200).json({ message: "Invoice deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAllInvoices(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "";

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.practice = {
        ...where.practice,
        name: { contains: search, mode: "insensitive" },
      };
    }

    if (status) {
      if (!isInvoiceStatus(status)) {
        return res.status(400).json({
          message: "Invalid invoice status.",
          allowedStatuses: Object.values(InvoiceStatus),
        });
      }
      where.status = status as InvoiceStatus;
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { practice: true, agreement: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return res.status(200).json({
      message: "Invoices fetched successfully.",
      invoices,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch invoices.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getInvoiceStripeEvents(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice id is required." });
    }

    const events = await prisma.stripeEventLog.findMany({
      where: { invoiceId: id },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      message: "Stripe events fetched successfully.",
      events,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch stripe events.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function processAndEmailInvoice(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      practice: {
        include: {
          persons: {
            include: {
              person: true,
            },
          },
          company: true,
        },
      },
      lineItems: {
        include: {
          service: true,
        },
      },
    },
  });

  if (!invoice || !invoice.practice) {
    throw new Error("Invoice or practice not found");
  }

  const billingRunItems = invoice.lineItems || [];
  const currency = (invoice.currency || invoice.practice.defaultCurrency || "USD").toLowerCase();

  let stripeInvoiceId: string | null = invoice.stripeInvoiceId || null;
  let hostedUrl: string | null = invoice.stripeHostedInvoiceUrl || null;
  let pdfUrl: string | null = invoice.stripeInvoicePdfUrl || null;

  if (!stripeInvoiceId) {
    // 1. Get or create Stripe Customer
    const customerId = await ensureStripeCustomerForPractice(invoice.practice);

    const hasCreditCardChargesService = billingRunItems.some((item) => {
      const name = (item.service?.name || "").toLowerCase().replace(/\s/g, "");
      return name === "creditcardcharges";
    });

    const paymentMethodTypes: string[] = hasCreditCardChargesService
      ? ["card"]
      : ["us_bank_account"];

    // 3. Create Invoice
    const stripeInvoice = await stripeRequest<{ id: string; hosted_invoice_url?: string | null; invoice_pdf?: string | null }>("POST", "/v1/invoices", {
      customer: customerId,
      auto_advance: false,
      collection_method: "send_invoice",
      due_date: invoice.dueDate
        ? Math.floor(new Date(invoice.dueDate).getTime() / 1000)
        : undefined,
      days_until_due: invoice.dueDate ? undefined : 30,
      pending_invoice_items_behavior: "exclude",
      metadata: { invoiceId: invoice.id },
      payment_settings: {
        payment_method_types: paymentMethodTypes,
      },
    });

    stripeInvoiceId = stripeInvoice.id;

    // 2. Create Invoice Items
    if (billingRunItems.length > 0) {
      for (const item of billingRunItems) {
        await stripeRequest("POST", "/v1/invoiceitems", {
          customer: customerId,
          invoice: stripeInvoiceId,
          amount: Math.round(Number(item.totalPrice) * 100), // amount in cents
          currency,
          description:
            item.description ||
            item.service?.code ||
            item.service?.name ||
            "Service Item",
          metadata: {
            localInvoiceId: invoice.id,
            localInvoiceLineItemId: item.id,
            serviceId: item.serviceId,
            stripeConnectedAccountId: item.stripeConnectedAccountId || "",
          },
        });
      }
    } else {
      await stripeRequest("POST", "/v1/invoiceitems", {
        customer: customerId,
        invoice: stripeInvoiceId,
        amount: Math.round(Number(invoice.totalAmount) * 100), // amount in cents
        currency,
        description: `Invoice ${invoice.invoiceNumber || invoice.id.slice(0, 8)}`,
      });
    }
  }

  // Finalize the invoice if it needs to be finalized
  if (stripeInvoiceId && !hostedUrl) {
    let finalizedInvoice;
    try {
      finalizedInvoice = await stripeRequest<{ hosted_invoice_url?: string | null; invoice_pdf?: string | null }>(
        "POST",
        `/v1/invoices/${stripeInvoiceId}/finalize`,
      );
    } catch (err: any) {
      // If it's already finalized, just retrieve it
      if (
        err.message &&
        err.message.includes("can only be finalized in draft")
      ) {
        finalizedInvoice = await stripeRequest(
          "GET",
          `/v1/invoices/${stripeInvoiceId}`,
        );
      } else {
        throw err;
      }
    }

    hostedUrl = finalizedInvoice.hosted_invoice_url || null;
    pdfUrl = finalizedInvoice.invoice_pdf || null;

    // Update DB with the finalized URL
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        stripeInvoiceId,
        stripeHostedInvoiceUrl: hostedUrl,
        stripeInvoicePdfUrl: pdfUrl,
      },
    });

    // Log the event
    await prisma.stripeEventLog.create({
      data: {
        invoiceId: invoice.id,
        eventType: "invoice.sent",
        stripeEventId: "evt_resend_" + Date.now(),
        payload: { action: "Sent payment email with Stripe link" },
      },
    });
  }

  // Update status to SENT if it was DRAFT
  if (invoice.status === "DRAFT") {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "SENT" },
    });
  }

  // Fetch recipient emails
  const emails =
    invoice.practice.persons
      ?.map((cp) => cp.person?.email)
      .filter(
        (email): email is string =>
          typeof email === "string" && email.includes("@"),
      ) || [];

  let recipientEmails = [...new Set(emails)];
  if (recipientEmails.length === 0 && invoice.practice.company?.email) {
    recipientEmails.push(invoice.practice.company.email);
  }

  if (recipientEmails.length > 0 && hostedUrl) {
    const practiceName = invoice.practice.name;
    const invoiceNumber = invoice.invoiceNumber || invoice.id.slice(0, 8);
    const formatUTCDate = (d: Date | string) => {
      const date = new Date(d);
      return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
    };
    const billingPeriodStart = invoice.billingPeriodStart
      ? formatUTCDate(invoice.billingPeriodStart)
      : "N/A";
    const billingPeriodEnd = invoice.billingPeriodEnd
      ? formatUTCDate(invoice.billingPeriodEnd)
      : "N/A";
    const billingPeriod = `${billingPeriodStart} to ${billingPeriodEnd}`;
    const dueDate = invoice.dueDate ? formatUTCDate(invoice.dueDate) : "N/A";
    const totalAmount = Number(invoice.totalAmount).toFixed(2);

    const itemsListHtml =
  billingRunItems && billingRunItems.length > 0
    ? `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 28px; margin-bottom: 24px;">
    <tr>
      <td>
        <h3
          class="section-title"
          style="
            margin: 0 0 12px 0;
            font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
            font-size: 14px;
            line-height: 20px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #0f4c81;
          "
        >
          Invoice Items
        </h3>

        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          class="items-table"
          style="width: 100%; border-collapse: collapse;"
        >
          <thead>
            <tr>
              <th
                align="left"
                class="items-head"
                style="
                  padding: 10px 8px 10px 0;
                  font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
                  font-size: 13px;
                  line-height: 18px;
                  font-weight: 700;
                  color: #365066;
                  border-bottom: 2px solid #cfdeea;
                "
              >
                Description
              </th>
              <th
                align="right"
                class="items-head"
                style="
                  padding: 10px 0 10px 8px;
                  font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
                  font-size: 13px;
                  line-height: 18px;
                  font-weight: 700;
                  color: #365066;
                  border-bottom: 2px solid #cfdeea;
                  width: 140px;
                "
              >
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            ${billingRunItems
              .map(
                (item) => `
              <tr>
                <td
                  class="items-cell"
                  style="
                    padding: 12px 8px 12px 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
                    font-size: 14px;
                    line-height: 20px;
                    color: #243b53;
                    vertical-align: top;
                    border-bottom: 1px solid #e5edf4;
                  "
                >
                  ${item.description || item.service?.code || item.service?.name || "Service Item"}
                </td>
                <td
                  align="right"
                  class="items-cell amount"
                  style="
                    padding: 12px 0 12px 8px;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
                    font-size: 14px;
                    line-height: 20px;
                    color: #0f2d46;
                    vertical-align: top;
                    font-weight: 700;
                    border-bottom: 1px solid #e5edf4;
                  "
                >
                  $${Number(item.totalPrice).toFixed(2)}
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </td>
    </tr>
  </table>
`
    : "";

const invoicePdfLinkHtml = pdfUrl
  ? `
    <p style="margin: 12px 0 0 0; font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; line-height: 20px; text-align: center;">
      
    </p>
  `
  : "";

const emailSubject = `Payment Required: Invoice ${invoiceNumber} for ${practiceName}`;

const emailBody = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>Invoice ${invoiceNumber}</title>

    <!--[if !mso]><!-- -->
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
    />
    <!--<![endif]-->

    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }

      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

      body,
      table,
      td,
      p,
      a,
      h1,
      h2,
      h3,
      span {
        font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial,
          sans-serif;
      }

      .email-bg {
        background-color: #eef4f8;
      }

      .email-card {
        background-color: #ffffff;
        border: 1px solid #d7e3ef;
        border-radius: 20px;
      }

      .brand-header {
        background: linear-gradient(135deg, #0f4c81 0%, #0f766e 100%);
      }

      .title {
        color: #0f2d46;
      }

      .text {
        color: #3f556b;
      }

      .label {
        color: #365066;
        font-weight: 700;
      }

      .value {
        color: #102a43;
      }

      .detail-card {
        background-color: #f8fbfe;
        border: 1px solid #dbe8f3;
        border-radius: 14px;
      }

      .section-title {
        color: #0f4c81;
      }

      .items-head {
        color: #365066;
        border-bottom: 2px solid #cfdeea;
      }

      .items-cell {
        color: #243b53;
        border-bottom: 1px solid #e5edf4;
      }

      .amount {
        color: #0f2d46;
        font-weight: 700;
      }

      .btn {
        background-color: #0f4c81;
        border: 1px solid #0f4c81;
        border-radius: 10px;
        color: #ffffff !important;
        display: inline-block;
        font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial,
          sans-serif;
        font-size: 15px;
        font-weight: 700;
        line-height: 20px;
        padding: 14px 28px;
        text-decoration: none;
      }

      .support {
        color: #5f7387;
      }

      .footer-card {
        background-color: #f8fbfe;
        border-top: 1px solid #dbe8f3;
      }

      .footer-title {
        color: #0f2d46;
      }

      .contact-link {
        color: #0f4c81 !important;
        text-decoration: none;
      }

      @media only screen and (max-width: 640px) {
        .container {
          width: 100% !important;
        }

        .content-padding {
          padding: 22px !important;
        }

        .header-padding {
          padding: 24px 18px !important;
        }

        .logo-img {
          width: 180px !important;
          max-width: 100% !important;
          height: auto !important;
        }

        .mobile-center {
          text-align: center !important;
        }
      }

      /* ---- DARK MODE ---- */

      @media (prefers-color-scheme: dark) {
        body,
        .email-bg {
          background-color: #0b1320 !important;
        }

        .email-card {
          background-color: #101b2d !important;
          border-color: #25364b !important;
        }

        .title {
          color: #eaf2ff !important;
        }

        .text,
        .support {
          color: #a9bbce !important;
        }

        .label {
          color: #c1d0df !important;
        }

        .value,
        .amount,
        .items-cell,
        .footer-title {
          color: #f3f8ff !important;
        }

        .detail-card {
          background-color: #122033 !important;
          border-color: #2a3f56 !important;
        }

        .items-head {
          color: #d0dbea !important;
          border-bottom-color: #31475f !important;
        }

        .items-cell {
          border-bottom-color: #223348 !important;
        }

        .footer-card {
          background-color: #0d1728 !important;
          border-top-color: #25364b !important;
        }

        .contact-link {
          color: #7cc9ff !important;
        }

        .btn {
          background-color: #1f6fb4 !important;
          border-color: #1f6fb4 !important;
          color: #ffffff !important;
        }
      }

      /* ---- OUTLOOK.COM DARK MODE ---- */

      [data-ogsc] .email-bg {
        background-color: #0b1320 !important;
      }

      [data-ogsc] .email-card {
        background-color: #101b2d !important;
        border-color: #25364b !important;
      }

      [data-ogsc] .title {
        color: #eaf2ff !important;
      }

      [data-ogsc] .text,
      [data-ogsc] .support {
        color: #a9bbce !important;
      }

      [data-ogsc] .label {
        color: #c1d0df !important;
      }

      [data-ogsc] .value,
      [data-ogsc] .amount,
      [data-ogsc] .items-cell,
      [data-ogsc] .footer-title {
        color: #f3f8ff !important;
      }

      [data-ogsc] .detail-card {
        background-color: #122033 !important;
        border-color: #2a3f56 !important;
      }

      [data-ogsc] .items-head {
        color: #d0dbea !important;
        border-bottom-color: #31475f !important;
      }

      [data-ogsc] .items-cell {
        border-bottom-color: #223348 !important;
      }

      [data-ogsc] .footer-card {
        background-color: #0d1728 !important;
        border-top-color: #25364b !important;
      }

      [data-ogsc] .contact-link {
        color: #7cc9ff !important;
      }

      [data-ogsc] .btn {
        background-color: #1f6fb4 !important;
        border-color: #1f6fb4 !important;
        color: #ffffff !important;
      }
    </style>

    <!--[if mso]>
      <style>
        body,
        table,
        td,
        p,
        a,
        h1,
        h2,
        h3,
        span {
          font-family: 'Segoe UI', Arial, sans-serif !important;
        }
      </style>
    <![endif]-->
  </head>

  <body
    style="
      margin: 0;
      padding: 0;
      background-color: #eef4f8;
      font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial,
        sans-serif;
    "
  >
    <!-- Preheader text -->
    <div
      style="
        display: none;
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        mso-hide: all;
        color: transparent;
      "
    >
      Invoice ${invoiceNumber} for ${practiceName}. Total amount
      $${totalAmount}. Due ${dueDate}.
    </div>

    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      class="email-bg"
      style="
        width: 100%;
        background-color: #eef4f8;
        margin: 0;
        padding: 0;
      "
    >
      <tr>
        <td align="center" style="padding: 24px 12px;">
          <!-- Main Card -->
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            class="container email-card"
            style="
              width: 100%;
              max-width: 680px;
              background-color: #ffffff;
              border: 1px solid #d7e3ef;
              border-radius: 20px;
              overflow: hidden;
            "
          >
            <!-- ===== HEADER ===== -->
            <tr>
              <td
                class="brand-header header-padding"
                align="center"
                style="
                  padding: 28px 24px;
                  background: linear-gradient(
                    135deg,
                    #ffffff 0%,
                    #ffffff 100%
                  );
                  border-radius: 20px 20px 0 0;
                "
              >
                <!-- Logo container -->
                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  align="center"
                  style="margin: 0 auto 16px auto;"
                >
                  <tr>
                    <td
                      style="
                        background-color: #ffffff;
                        border-radius: 14px;
                        padding: 12px 16px;
                      "
                    >
                      <img
                        src="https://tristatemso.com/wp-content/uploads/tristate-health-mso-logo.png"
                        alt="Tristate MSO"
                        width="210"
                        class="logo-img"
                        style="
                          display: block;
                          width: 210px;
                          max-width: 100%;
                          height: auto;
                          border: 0;
                        "
                      />
                    </td>
                  </tr>
                </table>

                <p
                  style="
                    margin: 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto,
                      Arial, sans-serif;
                    font-size: 13px;
                    line-height: 20px;
                    color: #21282c;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    font-weight: 700;
                  "
                >
                  Invoice Payment Request
                </p>

                <p
                  style="
                    margin: 6px 0 0 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto,
                      Arial, sans-serif;
                    font-size: 14px;
                    line-height: 22px;
                    color: #21282c;
                  "
                >
                  Tristate MSO Billing Department
                </p>
              </td>
            </tr>

            <!-- ===== BODY ===== -->
            <tr>
              <td
                class="content-padding"
                style="padding: 30px 30px 24px 30px;"
              >
                <p
                  class="title"
                  style="
                    margin: 0 0 14px 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto,
                      Arial, sans-serif;
                    font-size: 16px;
                    line-height: 24px;
                    color: #0f2d46;
                    font-weight: 700;
                  "
                >
                  Hello,
                </p>

                <p
                  class="text"
                  style="
                    margin: 0 0 20px 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto,
                      Arial, sans-serif;
                    font-size: 15px;
                    line-height: 24px;
                    color: #3f556b;
                  "
                >
                  An invoice has been generated for
                  <strong>${practiceName}</strong>. Please find the invoice
                  details and the payment link below:
                </p>

                <!-- Detail card -->
                <table
                  role="presentation"
                  width="100%"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  class="detail-card"
                  style="
                    width: 100%;
                    background-color: #f8fbfe;
                    border: 1px solid #dbe8f3;
                    border-radius: 14px;
                    margin-bottom: 26px;
                  "
                >
                  <tr>
                    <td style="padding: 18px 18px 8px 18px;">
                      <table
                        role="presentation"
                        width="100%"
                        cellpadding="0"
                        cellspacing="0"
                        border="0"
                        style="width: 100%; border-collapse: collapse;"
                      >
                        <tr>
                          <td
                            class="label"
                            style="
                              padding: 0 0 10px 0;
                              width: 42%;
                              font-family: 'Google Sans', 'Inter', 'Segoe UI',
                                Roboto, Arial, sans-serif;
                              font-size: 14px;
                              line-height: 22px;
                              color: #365066;
                              font-weight: 700;
                            "
                          >
                            Invoice Number:
                          </td>
                          <td
                            class="value"
                            style="
                              padding: 0 0 10px 0;
                              font-family: 'Google Sans', 'Inter', 'Segoe UI',
                                Roboto, Arial, sans-serif;
                              font-size: 14px;
                              line-height: 22px;
                              color: #102a43;
                            "
                          >
                            ${invoiceNumber}
                          </td>
                        </tr>

                        <tr>
                          <td
                            class="label"
                            style="
                              padding: 0 0 10px 0;
                              font-family: 'Google Sans', 'Inter', 'Segoe UI',
                                Roboto, Arial, sans-serif;
                              font-size: 14px;
                              line-height: 22px;
                              color: #365066;
                              font-weight: 700;
                            "
                          >
                            Billing Period:
                          </td>
                          <td
                            class="value"
                            style="
                              padding: 0 0 10px 0;
                              font-family: 'Google Sans', 'Inter', 'Segoe UI',
                                Roboto, Arial, sans-serif;
                              font-size: 14px;
                              line-height: 22px;
                              color: #102a43;
                            "
                          >
                            ${billingPeriod}
                          </td>
                        </tr>

                        <tr>
                          <td
                            class="label"
                            style="
                              padding: 0 0 10px 0;
                              font-family: 'Google Sans', 'Inter', 'Segoe UI',
                                Roboto, Arial, sans-serif;
                              font-size: 14px;
                              line-height: 22px;
                              color: #365066;
                              font-weight: 700;
                            "
                          >
                            Total Amount:
                          </td>
                          <td
                            class="amount"
                            style="
                              padding: 0 0 10px 0;
                              font-family: 'Google Sans', 'Inter', 'Segoe UI',
                                Roboto, Arial, sans-serif;
                              font-size: 17px;
                              line-height: 24px;
                              color: #0f2d46;
                              font-weight: 700;
                            "
                          >
                            $${totalAmount}
                          </td>
                        </tr>

                        <tr>
                          <td
                            class="label"
                            style="
                              padding: 0;
                              font-family: 'Google Sans', 'Inter', 'Segoe UI',
                                Roboto, Arial, sans-serif;
                              font-size: 14px;
                              line-height: 22px;
                              color: #365066;
                              font-weight: 700;
                            "
                          >
                            Due Date:
                          </td>
                          <td
                            class="value"
                            style="
                              padding: 0;
                              font-family: 'Google Sans', 'Inter', 'Segoe UI',
                                Roboto, Arial, sans-serif;
                              font-size: 14px;
                              line-height: 22px;
                              color: #102a43;
                            "
                          >
                            ${dueDate}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <!-- Invoice Items -->
                ${itemsListHtml}

                <!-- CTA Button -->
                <table
                  role="presentation"
                  width="100%"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                >
                  <tr>
                    <td align="center" style="padding: 8px 0 4px 0;">
                      <!--[if mso]>
                      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${hostedUrl}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="12%" strokecolor="#0f4c81" fillcolor="#0f4c81">
                        <w:anchorlock/>
                        <center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:bold;">
                          Pay Invoice with Stripe
                        </center>
                      </v:roundrect>
                      <![endif]-->

                      <!--[if !mso]><!-- -->
                      <a
                        href="${hostedUrl}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="btn"
                        style="
                          background-color: #0f4c81;
                          border: 1px solid #0f4c81;
                          border-radius: 10px;
                          color: #ffffff;
                          display: inline-block;
                          font-family: 'Google Sans', 'Inter', 'Segoe UI',
                            Roboto, Arial, sans-serif;
                          font-size: 15px;
                          font-weight: 700;
                          line-height: 20px;
                          padding: 14px 28px;
                          text-decoration: none;
                        "
                      >
                        Pay Invoice with Stripe
                      </a>
                      <!--<![endif]-->
                      ${invoicePdfLinkHtml}
                    </td>
                  </tr>
                </table>

                <!-- Support text -->
                <p
                  class="support"
                  style="
                    margin: 26px 0 0 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto,
                      Arial, sans-serif;
                    font-size: 13px;
                    line-height: 22px;
                    color: #5f7387;
                  "
                >
                  If you have any questions regarding this invoice, please
                  reach out to our billing team.
                </p>

                <p
                  class="support"
                  style="
                    margin: 16px 0 0 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto,
                      Arial, sans-serif;
                    font-size: 13px;
                    line-height: 22px;
                    color: #5f7387;
                  "
                >
                  Best regards,<br />
                  <strong
                    class="footer-title"
                    style="color: #0f2d46;"
                    >The Tristate Team</strong
                  >
                </p>
              </td>
            </tr>

            <!-- ===== FOOTER ===== -->
            <tr>
              <td
                class="footer-card content-padding"
                style="
                  padding: 22px 30px 26px 30px;
                  background-color: #f8fbfe;
                  border-top: 1px solid #dbe8f3;
                  border-radius: 0 0 20px 20px;
                "
              >
                <p
                  class="footer-title"
                  style="
                    margin: 0 0 10px 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto,
                      Arial, sans-serif;
                    font-size: 15px;
                    line-height: 22px;
                    color: #0f2d46;
                    font-weight: 700;
                  "
                >
                  Tristate MSO
                </p>

                <p
                  class="support"
                  style="
                    margin: 0;
                    font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto,
                      Arial, sans-serif;
                    font-size: 13px;
                    line-height: 22px;
                    color: #5f7387;
                  "
                >
                  <a
                    href="mailto:info@tristatemso.com"
                    class="contact-link"
                    style="
                      color: #0f4c81;
                      text-decoration: none;
                      font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto,
                        Arial, sans-serif;
                    "
                  >
                    info@tristatemso.com
                  </a>
                  <br />
                  <a
                    href="tel:+19083406110"
                    class="contact-link"
                    style="
                      color: #0f4c81;
                      text-decoration: none;
                      font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto,
                        Arial, sans-serif;
                    "
                  >
                    (908) 340-6110
                  </a>
                  &nbsp;|&nbsp;
                  <a
                    href="tel:+19083406122"
                    class="contact-link"
                    style="
                      color: #0f4c81;
                      text-decoration: none;
                      font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto,
                        Arial, sans-serif;
                    "
                  >
                    (908) 340-6122
                  </a>
                  <br />
                  155 Willowbrook Blvd,<br />
                  Ste 110 #3408 Wayne, NJ 07470
                </p>
              </td>
            </tr>
          </table>

          <!-- Sub-footer note -->
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            class="container"
            style="width: 100%; max-width: 680px;"
          >
            <tr>
              <td
                align="center"
                style="
                  padding: 18px 12px 6px 12px;
                  font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto,
                    Arial, sans-serif;
                  font-size: 11px;
                  line-height: 18px;
                  color: #8da0b5;
                "
              >
                &copy; ${new Date().getFullYear()} Tristate MSO. All rights
                reserved.<br />
                This email was sent regarding Invoice ${invoiceNumber}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    let pdfBuffer: Buffer | null = null;
    try {
      pdfBuffer = await generateInvoicePdfBufferFromDb(invoiceId, prisma);
    } catch (pdfErr) {
      console.error("[processAndEmailInvoice] Failed to generate PDF buffer:", pdfErr);
    }

    const pdfFileName = `Invoice-${invoiceNumber || "Document"}.pdf`;

    for (const email of recipientEmails) {
      try {
        await sendOutlookEmail(email, emailSubject, emailBody, {
          attachments: pdfBuffer ? [
            {
              name: pdfFileName,
              contentType: "application/pdf",
              contentBytes: pdfBuffer.toString("base64"),
            }
          ] : undefined
        });
      } catch (emailErr) {
        console.error(`Failed to send outlook email to ${email}:`, emailErr);
      }
    }
  } else {
    console.warn(
      `No recipient emails found or no hosted Stripe url available for invoice ${invoiceId}`,
    );
  }
}

export async function resendStripeInvoice(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice id is required." });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { status: true },
    });
    if (invoice?.status === InvoiceStatus.PAID) {
      return res.status(400).json({
        message: "Paid invoices cannot be resent.",
      });
    }

    await processAndEmailInvoice(id);

    return res.status(200).json({
      message: "Invoice payment email sent successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to resend invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
