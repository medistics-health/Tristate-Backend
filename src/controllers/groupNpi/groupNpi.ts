import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { EntityStatus } from "../../../generated/prisma/client";

type GroupNpiBody = {
  groupNpiNumber: string;
  groupName: string;
  taxId: string;
  practiceGroupId?: string;
  practiceId?: string;
  status?: string;
  notes?: string;
};

function isEntityStatus(status: string): status is EntityStatus {
  return Object.values(EntityStatus).includes(status as EntityStatus);
}

export async function createGroupNpi(req: AuthenticatedRequest, res: Response) {
  try {
    const { groupNpiNumber, groupName, taxId, practiceGroupId, practiceId, status, notes } = req.body as GroupNpiBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!groupNpiNumber || !groupName || !taxId) {
      return res.status(400).json({ message: "groupNpiNumber, groupName, and taxId are required." });
    }

    if (status && !isEntityStatus(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    // Verify Tax ID access via Company
    const taxIdRecord = await prisma.taxId.findUnique({
      where: { id: taxId },
      include: { company: true },
    });

    if (!taxIdRecord) {
      return res.status(404).json({ message: "Tax ID not found." });
    }

    // Verify practiceGroupId if provided
    if (practiceGroupId) {
      const practiceGroup = await prisma.practiceGroup.findFirst({
        where: { id: practiceGroupId, companyId: taxIdRecord.companyId },
      });
      if (!practiceGroup) {
        return res.status(400).json({ message: "Invalid practice group for this company." });
      }
    }

    // Verify practiceId if provided
    if (practiceId) {
      const practice = await prisma.practice.findFirst({
        where: { id: practiceId, companyId: taxIdRecord.companyId },
      });
      if (!practice) {
        return res.status(400).json({ message: "Invalid practice for this company." });
      }
    }

    const groupNpi = await prisma.groupNpi.create({
      data: {
        groupNpiNumber,
        groupName,
        taxId,
        practiceGroupId,
        practiceId,
        status: (status as EntityStatus) || EntityStatus.ACTIVE,
        notes,
      },
    });

    return res.status(201).json({
      message: "Group NPI created successfully.",
      groupNpi,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create Group NPI.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getGroupNpis(req: AuthenticatedRequest, res: Response) {
  try {
    const { taxId, companyId } = req.query;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const where: any = {};

    if (taxId) {
      const taxIdRecord = await prisma.taxId.findUnique({
        where: { id: taxId as string },
        include: { company: true },
      });
      if (!taxIdRecord) {
        return res.status(404).json({ message: "Tax ID not found or unauthorized." });
      }
      where.taxId = taxId as string;
    } else if (companyId) {
      const company = await prisma.company.findFirst({
        where: { id: companyId as string },
      });
      if (!company) {
        return res.status(404).json({ message: "Company not found." });
      }
      where.tax = { companyId: companyId as string };
    } else {
      return res.status(400).json({ message: "Either taxId or companyId is required." });
    }

    const groupNpis = await prisma.groupNpi.findMany({
      where,
      include: {
        tax: true,
        practiceGroup: true,
        practice: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      message: "Group NPIs fetched successfully.",
      groupNpis,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch Group NPIs.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getGroupNpi(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Group NPI id is required." });
    }

    const groupNpi = await prisma.groupNpi.findUnique({
      where: { id },
      include: {
        tax: { include: { company: true } },
        practiceGroup: true,
        practice: true,
      },
    });

    if (!groupNpi || !groupNpi.tax) {
      return res.status(404).json({ message: "Group NPI not found." });
    }

    return res.status(200).json({
      message: "Group NPI fetched successfully.",
      groupNpi,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch Group NPI.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateGroupNpi(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { groupNpiNumber, groupName, status, notes, practiceGroupId, practiceId } = req.body as Partial<GroupNpiBody>;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Group NPI id is required." });
    }

    const existingNpi = await prisma.groupNpi.findUnique({
      where: { id },
      include: { tax: { include: { company: true } } },
    });

    if (!existingNpi || !existingNpi.tax) {
      return res.status(404).json({ message: "Group NPI not found." });
    }

    if (status && !isEntityStatus(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    // Verify practiceGroupId if provided
    if (practiceGroupId) {
      const practiceGroup = await prisma.practiceGroup.findFirst({
        where: { id: practiceGroupId, companyId: existingNpi.tax.companyId },
      });
      if (!practiceGroup) {
        return res.status(400).json({ message: "Invalid practice group for this company." });
      }
    }

    // Verify practiceId if provided
    if (practiceId) {
      const practice = await prisma.practice.findFirst({
        where: { id: practiceId, companyId: existingNpi.tax.companyId },
      });
      if (!practice) {
        return res.status(400).json({ message: "Invalid practice for this company." });
      }
    }

    const groupNpi = await prisma.groupNpi.update({
      where: { id },
      data: {
        groupNpiNumber,
        groupName,
        status: status as EntityStatus,
        notes,
        practiceGroupId,
        practiceId,
      },
    });

    return res.status(200).json({
      message: "Group NPI updated successfully.",
      groupNpi,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update Group NPI.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteGroupNpi(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Group NPI id is required." });
    }

    const existingNpi = await prisma.groupNpi.findUnique({
      where: { id },
      include: { tax: { include: { company: true } } },
    });

    if (!existingNpi || !existingNpi.tax) {
      return res.status(404).json({ message: "Group NPI not found." });
    }

    await prisma.groupNpi.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "Group NPI deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete Group NPI.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
