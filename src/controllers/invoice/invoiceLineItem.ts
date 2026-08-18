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
      where: { id: invoiceId },
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found." });
    }

    const stripeConnectedAccountId = service.stripeConnectedAccountId?.trim();
    if (!stripeConnectedAccountId) {
      return res.status(400).json({
        message: "Service is missing a Stripe connected account mapping.",
      });
    }

    const invoiceLineItem = await prisma.invoiceLineItem.create({
      data: {
        invoiceId,
        serviceId,
        stripeConnectedAccountId,
        quantity,
        unitPrice,
        totalPrice,
      },
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
      return res
        .status(400)
        .json({ message: "Invoice line item id is required." });
    }

    const invoiceLineItem = await prisma.invoiceLineItem.findFirst({
      where: { id },
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
      return res
        .status(400)
        .json({ message: "Invoice line item id is required." });
    }

    const existingInvoiceLineItem = await prisma.invoiceLineItem.findFirst({
      where: { id },
    });

    if (!existingInvoiceLineItem) {
      return res.status(404).json({ message: "Invoice line item not found." });
    }

    let stripeConnectedAccountId: string | null | undefined;
    if (serviceId !== undefined) {
      const service = await prisma.service.findUnique({
        where: { id: serviceId },
      });
      if (!service) {
        return res.status(404).json({ message: "Service not found." });
      }
      stripeConnectedAccountId = service.stripeConnectedAccountId?.trim() || null;
      if (!stripeConnectedAccountId) {
        return res.status(400).json({
          message: "Service is missing a Stripe connected account mapping.",
        });
      }
    }

    const invoiceLineItem = await prisma.invoiceLineItem.update({
      where: { id },
      data: {
        ...(serviceId !== undefined ? { serviceId } : {}),
        ...(serviceId !== undefined ? { stripeConnectedAccountId } : {}),
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
      return res
        .status(400)
        .json({ message: "Invoice line item id is required." });
    }

    const existingInvoiceLineItem = await prisma.invoiceLineItem.findFirst({
      where: { id },
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

export async function getAllInvoiceLineItems(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 1000;
    const search = (req.query.search as string) || "";
    const dateFrom = (req.query.dateFrom as string) || "";
    const dateTo = (req.query.dateTo as string) || "";
    const invoiceId = req.query.invoiceId as string;
    const invoiceNumber = req.query.invoiceNumber as string;
    const serviceId = req.query.serviceId as string;
    const sortBy = (req.query.sortBy as string) || "createdAt";
    const sortOrder = (req.query.sortOrder as string)?.toLowerCase() === "asc" ? "asc" : "desc";

    const skip = (page - 1) * limit;

    const where: any = {};
    const andConditions: any[] = [];

    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    if (serviceId) {
      where.serviceId = serviceId;
    }

    if (invoiceNumber) {
      where.invoice = {
        invoiceNumber: {
          contains: invoiceNumber.trim(),
          mode: "insensitive",
        },
      };
    }

    if (search.trim()) {
      const q = search.trim();
      andConditions.push({
        OR: [
          { invoice: { invoiceNumber: { contains: q, mode: "insensitive" } } },
          { service: { name: { contains: q, mode: "insensitive" } } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    let orderBy: any = { createdAt: sortOrder };
    if (sortBy === "invoiceLabel" || sortBy === "invoice") {
      orderBy = { invoice: { invoiceNumber: sortOrder } };
    } else if (sortBy === "serviceName" || sortBy === "service") {
      orderBy = { service: { name: sortOrder } };
    } else if (sortBy === "quantity") {
      orderBy = { quantity: sortOrder };
    } else if (sortBy === "unitPrice") {
      orderBy = { unitPrice: sortOrder };
    } else if (sortBy === "totalPrice") {
      orderBy = { totalPrice: sortOrder };
    } else if (sortBy === "updatedAt" || sortBy === "lastUpdate") {
      orderBy = { updatedAt: sortOrder };
    }

    const [lineItems, total] = await Promise.all([
      prisma.invoiceLineItem.findMany({
        where,
        include: { invoice: true, service: true },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.invoiceLineItem.count({ where }),
    ]);

    return res.status(200).json({
      message: "Invoice line items fetched successfully.",
      lineItems,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch invoice line items.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
