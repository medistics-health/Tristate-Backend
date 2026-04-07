import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type PurchaseOrderBody = {
  vendorId?: string;
  invoiceId?: string;
  totalCost?: number;
};

export async function createPurchaseOrder(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { vendorId, invoiceId, totalCost } = req.body as PurchaseOrderBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!vendorId || !invoiceId || totalCost === undefined) {
      return res.status(400).json({
        message: "vendorId, invoiceId and totalCost are required.",
      });
    }

    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, practice: { ownerId: req.user.sub } },
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: { vendorId, invoiceId, totalCost },
    });

    return res.status(201).json({
      message: "Purchase order created successfully.",
      purchaseOrder,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create purchase order.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getPurchaseOrder(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Purchase order id is required." });
    }

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, invoice: { practice: { ownerId: req.user.sub } } },
      include: { vendor: true, invoice: true },
    });

    if (!purchaseOrder) {
      return res.status(404).json({ message: "Purchase order not found." });
    }

    return res.status(200).json({
      message: "Purchase order fetched successfully.",
      purchaseOrder,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch purchase order.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updatePurchaseOrder(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { vendorId, totalCost } = req.body as PurchaseOrderBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Purchase order id is required." });
    }

    const existingPurchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, invoice: { practice: { ownerId: req.user.sub } } },
    });

    if (!existingPurchaseOrder) {
      return res.status(404).json({ message: "Purchase order not found." });
    }

    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found." });
      }
    }

    const purchaseOrder = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...(vendorId !== undefined ? { vendorId } : {}),
        ...(totalCost !== undefined ? { totalCost } : {}),
      },
    });

    return res.status(200).json({
      message: "Purchase order updated successfully.",
      purchaseOrder,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update purchase order.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deletePurchaseOrder(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Purchase order id is required." });
    }

    const existingPurchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, invoice: { practice: { ownerId: req.user.sub } } },
    });

    if (!existingPurchaseOrder) {
      return res.status(404).json({ message: "Purchase order not found." });
    }

    await prisma.purchaseOrder.delete({ where: { id } });

    return res.status(200).json({
      message: "Purchase order deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete purchase order.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
