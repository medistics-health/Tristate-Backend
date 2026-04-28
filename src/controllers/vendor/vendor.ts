import { VendorType } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type VendorBody = {
  name?: string;
  type?: string;
  renewalDate?: string;
  quickbooksVendorId?: string | null;
  remitEmail?: string | null;
  paymentTerms?: string | null;
};

function isVendorType(type: string): type is VendorType {
  return Object.values(VendorType).includes(type as VendorType);
}

export async function createVendor(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, type, renewalDate, quickbooksVendorId, remitEmail, paymentTerms } =
      req.body as VendorBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!name || !type) {
      return res.status(400).json({ message: "name and type are required." });
    }

    if (!isVendorType(type)) {
      return res.status(400).json({
        message: "Invalid vendor type.",
        allowedTypes: Object.values(VendorType),
      });
    }

    const vendor = await prisma.vendor.create({
      data: {
        name,
        type,
        renewalDate: renewalDate ? new Date(renewalDate) : undefined,
        ...(quickbooksVendorId !== undefined
          ? { quickbooksVendorId: quickbooksVendorId || null }
          : {}),
        ...(remitEmail !== undefined ? { remitEmail: remitEmail || null } : {}),
        ...(paymentTerms !== undefined
          ? { paymentTerms: paymentTerms || null }
          : {}),
      },
    });

    return res.status(201).json({ message: "Vendor created successfully.", vendor });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create vendor.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getVendor(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Vendor id is required." });
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { purchaseOrders: true, vendorPayables: true },
    });

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    return res.status(200).json({ message: "Vendor fetched successfully.", vendor });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch vendor.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateVendor(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { name, type, renewalDate, quickbooksVendorId, remitEmail, paymentTerms } =
      req.body as VendorBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Vendor id is required." });
    }

    if (type !== undefined && !isVendorType(type)) {
      return res.status(400).json({
        message: "Invalid vendor type.",
        allowedTypes: Object.values(VendorType),
      });
    }

    const existingVendor = await prisma.vendor.findUnique({ where: { id } });

    if (!existingVendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(type !== undefined ? { type: type as VendorType } : {}),
        ...(renewalDate !== undefined
          ? { renewalDate: renewalDate ? new Date(renewalDate) : null }
          : {}),
        ...(quickbooksVendorId !== undefined
          ? { quickbooksVendorId: quickbooksVendorId || null }
          : {}),
        ...(remitEmail !== undefined ? { remitEmail: remitEmail || null } : {}),
        ...(paymentTerms !== undefined
          ? { paymentTerms: paymentTerms || null }
          : {}),
      },
    });

    return res.status(200).json({ message: "Vendor updated successfully.", vendor });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update vendor.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getVendors(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const { search, type } = req.query;

    const where: any = {};

    if (search) {
      where.name = { contains: search as string, mode: "insensitive" };
    }

    if (type) {
      where.type = type as VendorType;
    }

    const [vendors, totalRecords] = await Promise.all([
      prisma.vendor.findMany({
        where,
        include: {
          _count: {
            select: { purchaseOrders: true, vendorPayables: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.vendor.count({ where }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      message: "Vendors fetched successfully.",
      vendors,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch vendors.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteVendor(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Vendor id is required." });
    }

    const existingVendor = await prisma.vendor.findUnique({ where: { id } });

    if (!existingVendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    await prisma.vendor.delete({ where: { id } });

    return res.status(200).json({ message: "Vendor deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete vendor.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
