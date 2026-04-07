import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type InvoiceLineItemBody = {
  invoiceId?: string;
  serviceId?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
};

export async function createInvoiceLineItem(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { invoiceId, serviceId, quantity, unitPrice, totalPrice } =
      req.body as InvoiceLineItemBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (
      !invoiceId ||
      !serviceId ||
      quantity === undefined ||
      unitPrice === undefined ||
      totalPrice === undefined
    ) {
      return res.status(400).json({
        message:
          "invoiceId, serviceId, quantity, unitPrice and totalPrice are required.",
      });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, practice: { ownerId: req.user.sub } },
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    const service = await prisma.service.findUnique({ where: { id: serviceId } });

    if (!service) {
      return res.status(404).json({ message: "Service not found." });
    }

    const invoiceLineItem = await prisma.invoiceLineItem.create({
      data: { invoiceId, serviceId, quantity, unitPrice, totalPrice },
    });

    return res.status(201).json({
      message: "Invoice line item created successfully.",
      invoiceLineItem,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create invoice line item.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getInvoiceLineItem(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice line item id is required." });
    }

    const invoiceLineItem = await prisma.invoiceLineItem.findFirst({
      where: { id, invoice: { practice: { ownerId: req.user.sub } } },
      include: { invoice: true, service: true },
    });

    if (!invoiceLineItem) {
      return res.status(404).json({ message: "Invoice line item not found." });
    }

    return res.status(200).json({
      message: "Invoice line item fetched successfully.",
      invoiceLineItem,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch invoice line item.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateInvoiceLineItem(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { serviceId, quantity, unitPrice, totalPrice } =
      req.body as InvoiceLineItemBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice line item id is required." });
    }

    const existingInvoiceLineItem = await prisma.invoiceLineItem.findFirst({
      where: { id, invoice: { practice: { ownerId: req.user.sub } } },
    });

    if (!existingInvoiceLineItem) {
      return res.status(404).json({ message: "Invoice line item not found." });
    }

    if (serviceId) {
      const service = await prisma.service.findUnique({ where: { id: serviceId } });
      if (!service) {
        return res.status(404).json({ message: "Service not found." });
      }
    }

    const invoiceLineItem = await prisma.invoiceLineItem.update({
      where: { id },
      data: {
        ...(serviceId !== undefined ? { serviceId } : {}),
        ...(quantity !== undefined ? { quantity } : {}),
        ...(unitPrice !== undefined ? { unitPrice } : {}),
        ...(totalPrice !== undefined ? { totalPrice } : {}),
      },
    });

    return res.status(200).json({
      message: "Invoice line item updated successfully.",
      invoiceLineItem,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update invoice line item.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteInvoiceLineItem(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice line item id is required." });
    }

    const existingInvoiceLineItem = await prisma.invoiceLineItem.findFirst({
      where: { id, invoice: { practice: { ownerId: req.user.sub } } },
    });

    if (!existingInvoiceLineItem) {
      return res.status(404).json({ message: "Invoice line item not found." });
    }

    await prisma.invoiceLineItem.delete({ where: { id } });

    return res.status(200).json({
      message: "Invoice line item deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete invoice line item.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
