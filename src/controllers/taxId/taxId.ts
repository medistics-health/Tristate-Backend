import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { EntityStatus } from "../../../generated/prisma/client";

type TaxIdBody = {
  taxIdNumber: string;
  legalEntityName: string;
  companyId: string;
  status?: string;
  notes?: string;
};

function isEntityStatus(status: string): status is EntityStatus {
  return Object.values(EntityStatus).includes(status as EntityStatus);
}

export async function createTaxId(req: AuthenticatedRequest, res: Response) {
  try {
    const { taxIdNumber, legalEntityName, companyId, status, notes } = req.body as TaxIdBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!taxIdNumber || !legalEntityName || !companyId) {
      return res.status(400).json({ message: "taxIdNumber, legalEntityName, and companyId are required." });
    }

    if (status && !isEntityStatus(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    // Verify company exists
    const company = await prisma.company.findFirst({
      where: { id: companyId },
    });

    if (!company) {
      return res.status(404).json({ message: "Company not found." });
    }

    const taxId = await prisma.taxId.create({
      data: {
        taxIdNumber,
        legalEntityName,
        companyId,
        status: (status as EntityStatus) || EntityStatus.ACTIVE,
        notes,
      },
    });

    return res.status(201).json({
      message: "Tax ID created successfully.",
      taxId,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create Tax ID.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getTaxIds(req: AuthenticatedRequest, res: Response) {
  try {
    const { companyId } = req.query;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required." });
    }

    // Verify company exists
    const company = await prisma.company.findFirst({
      where: { id: companyId as string },
    });

    if (!company) {
      return res.status(404).json({ message: "Company not found." });
    }

    const taxIds = await prisma.taxId.findMany({
      where: { companyId: companyId as string },
      include: {
        _count: {
          select: { groupNpis: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      message: "Tax IDs fetched successfully.",
      taxIds,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch Tax IDs.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getTaxId(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Tax ID id is required." });
    }

    const taxId = await prisma.taxId.findUnique({
      where: { id },
      include: {
        company: true,
        groupNpis: true,
      },
    });

    if (!taxId) {
      return res.status(404).json({ message: "Tax ID not found." });
    }

    return res.status(200).json({
      message: "Tax ID fetched successfully.",
      taxId,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch Tax ID.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateTaxId(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { taxIdNumber, legalEntityName, status, notes } = req.body as Partial<TaxIdBody>;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Tax ID id is required." });
    }

    const existingTaxId = await prisma.taxId.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!existingTaxId) {
      return res.status(404).json({ message: "Tax ID not found." });
    }

    if (status && !isEntityStatus(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const taxId = await prisma.taxId.update({
      where: { id },
      data: {
        taxIdNumber,
        legalEntityName,
        status: status as EntityStatus,
        notes,
      },
    });

    return res.status(200).json({
      message: "Tax ID updated successfully.",
      taxId,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update Tax ID.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteTaxId(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Tax ID id is required." });
    }

    const existingTaxId = await prisma.taxId.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!existingTaxId) {
      return res.status(404).json({ message: "Tax ID not found." });
    }

    await prisma.taxId.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "Tax ID deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete Tax ID.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
