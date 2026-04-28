import { InvoiceStatus } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
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
