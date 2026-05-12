import { InvoiceStatus } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import { stripe } from "../../lib/stripe";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

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

function isInvoiceStatus(status: string): status is InvoiceStatus {
  return Object.values(InvoiceStatus).includes(status as InvoiceStatus);
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

    const invoice = await prisma.invoice.create({
      data: {
        practiceId,
        agreementId: agreementId ?? undefined,
        totalAmount,
        status,
        dueDate: dueDate ? new Date(dueDate) : undefined,
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

    return res.status(201).json({
      message: "Invoice created successfully.",
      invoice,
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
      where: { id,  },
      include: {
        practice: true,
        agreement: true,
        lineItems: true,
        purchaseOrders: true,
        vendorPayables: true,
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
      where: { id,  },
    });

    if (!existingInvoice) {
      return res.status(404).json({ message: "Invoice not found." });
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
      where: { id,  },
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

export async function getInvoiceStripeEvents(req: AuthenticatedRequest, res: Response) {
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

export async function resendStripeInvoice(req: AuthenticatedRequest, res: Response) {
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
      include: { practice: true },
    });

    if (!invoice || !invoice.practice) {
      return res.status(404).json({ message: "Invoice or practice not found." });
    }

    let stripeInvoiceId: string | null = invoice.stripeInvoiceId || null;
    let hostedUrl: string | null = invoice.stripeHostedInvoiceUrl || null;

    if (!stripeInvoiceId) {
      // 1. Get or create Stripe Customer
      let customerId = invoice.practice.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: invoice.practice.name,
          email: "billing@" + invoice.practice.name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com",
          metadata: { practiceId: invoice.practice.id },
        });
        customerId = customer.id;
        await prisma.practice.update({
          where: { id: invoice.practice.id },
          data: { stripeCustomerId: customerId },
        });
      }

      // 2. Create Invoice Item
      await stripe.invoiceItems.create({
        customer: customerId,
        amount: Math.round(Number(invoice.totalAmount) * 100), // amount in cents
        currency: "usd",
        description: `Invoice ${invoice.invoiceNumber || invoice.id.slice(0, 8)}`,
      });

      // 3. Create Invoice
      const stripeInvoice = await stripe.invoices.create({
        customer: customerId,
        auto_advance: false,
        collection_method: "send_invoice",
        days_until_due: 30,
        pending_invoice_items_behavior: "include",
        metadata: { invoiceId: invoice.id },
      });

      stripeInvoiceId = stripeInvoice.id;
    }

    // Finalize the invoice if it needs to be finalized
    if (stripeInvoiceId) {
      let finalizedInvoice;
      try {
        finalizedInvoice = await stripe.invoices.finalizeInvoice(stripeInvoiceId);
      } catch (err: any) {
        // If it's already finalized, just retrieve it
        if (err.message && err.message.includes("can only be finalized in draft")) {
          finalizedInvoice = await stripe.invoices.retrieve(stripeInvoiceId);
        } else {
          throw err;
        }
      }

      hostedUrl = finalizedInvoice.hosted_invoice_url || null;

      // Update DB with the finalized URL
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          stripeInvoiceId,
          stripeHostedInvoiceUrl: hostedUrl,
          stripeInvoicePdfUrl: finalizedInvoice.invoice_pdf || null,
        },
      });

      // Log the event
      await prisma.stripeEventLog.create({
        data: {
          invoiceId: id,
          eventType: "invoice.sent",
          stripeEventId: "evt_resend_" + Date.now(),
          payload: { action: "Resent invoice via Stripe SDK" },
        },
      });

      // Update status to SENT if it was DRAFT
      if (invoice.status === "DRAFT") {
        await prisma.invoice.update({
          where: { id },
          data: { status: "SENT" },
        });
      }
    }

    return res.status(200).json({
      message: "Invoice resent successfully via Stripe.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to resend invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
