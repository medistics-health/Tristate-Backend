import { AuditType, Prisma } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type AuditBody = {
  practiceId?: string;
  dealId?: string | null;
  type?: string;
  score?: number;
  findings?: unknown;
  recommendations?: unknown;
};

function isAuditType(type: string): type is AuditType {
  return Object.values(AuditType).includes(type as AuditType);
}

export async function createAudit(req: AuthenticatedRequest, res: Response) {
  try {
    const { practiceId, dealId, type, score, findings, recommendations } =
      req.body as AuditBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (
      !practiceId ||
      !type ||
      findings === undefined ||
      recommendations === undefined ||
      findings === null ||
      recommendations === null
    ) {
      return res.status(400).json({
        message:
          "practiceId, type, findings and recommendations are required. JSON fields cannot be null.",
      });
    }

    if (!isAuditType(type)) {
      return res.status(400).json({
        message: "Invalid audit type.",
        allowedTypes: Object.values(AuditType),
      });
    }

    const practice = await prisma.practice.findFirst({
      where: { id: practiceId },
    });

    if (!practice) {
      return res.status(404).json({ message: "Practice not found." });
    }

    if (dealId) {
      const deal = await prisma.deal.findFirst({
        where: { id: dealId, practiceId },
      });
      if (!deal) {
        return res
          .status(404)
          .json({ message: "Deal not found for practice." });
      }
    }

    const audit = await prisma.audit.create({
      data: {
        practiceId,
        dealId: dealId ?? undefined,
        type,
        score,
        findings: findings as Prisma.InputJsonValue,
        recommendations: recommendations as Prisma.InputJsonValue,
      },
    });

    return res
      .status(201)
      .json({ message: "Audit created successfully.", audit });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create audit.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAudit(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Audit id is required." });
    }

    const audit = await prisma.audit.findFirst({
      where: { id,  },
      include: { practice: true, deal: true },
    });

    if (!audit) {
      return res.status(404).json({ message: "Audit not found." });
    }

    return res
      .status(200)
      .json({ message: "Audit fetched successfully.", audit });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch audit.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateAudit(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { dealId, type, score, findings, recommendations } =
      req.body as AuditBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Audit id is required." });
    }

    if (type !== undefined && !isAuditType(type)) {
      return res.status(400).json({
        message: "Invalid audit type.",
        allowedTypes: Object.values(AuditType),
      });
    }

    const existingAudit = await prisma.audit.findFirst({
      where: { id,  },
    });

    if (!existingAudit) {
      return res.status(404).json({ message: "Audit not found." });
    }

    if (dealId) {
      const deal = await prisma.deal.findFirst({
        where: {
          id: dealId,
          practiceId: existingAudit.practiceId,
        },
      });
      if (!deal) {
        return res.status(404).json({ message: "Deal not found for audit." });
      }
    }

    const updateData: Prisma.AuditUncheckedUpdateInput = {};

    if (dealId !== undefined) {
      updateData.dealId = dealId || null;
    }

    if (type !== undefined) {
      updateData.type = type as AuditType;
    }

    if (score !== undefined) {
      updateData.score = score;
    }

    if (findings !== undefined) {
      if (findings === null) {
        return res.status(400).json({ message: "findings cannot be null." });
      }

      updateData.findings = findings as Prisma.InputJsonValue;
    }

    if (recommendations !== undefined) {
      if (recommendations === null) {
        return res.status(400).json({
          message: "recommendations cannot be null.",
        });
      }

      updateData.recommendations = recommendations as Prisma.InputJsonValue;
    }

    const audit = await prisma.audit.update({
      where: { id },
      data: updateData,
    });

    return res
      .status(200)
      .json({ message: "Audit updated successfully.", audit });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update audit.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAllAudits(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    // const search = (req.query.search as string) || "";
    const type = (req.query.type as string) || "";

    const skip = (page - 1) * limit;

    const where: any = {};

    // if (search) {
    //   where.practice = {
    //     ...where.practice,
    //     name: { contains: search, mode: "insensitive" },
    //   };
    // }

    if (type) {
      if (!isAuditType(type)) {
        return res.status(400).json({
          message: "Invalid audit type.",
          allowedTypes: Object.values(AuditType),
        });
      }
      where.type = type as AuditType;
    }

    const [audits, total] = await Promise.all([
      prisma.audit.findMany({
        where,
        include: { practice: true, deal: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.audit.count({ where }),
    ]);

    return res.status(200).json({
      message: "Audits fetched successfully.",
      audits,
      pagination: {
        totalRecords: total,
        currentPage: page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch audits.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteAudit(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Audit id is required." });
    }

    const existingAudit = await prisma.audit.findFirst({
      where: { id,  },
    });

    if (!existingAudit) {
      return res.status(404).json({ message: "Audit not found." });
    }

    await prisma.audit.delete({ where: { id } });

    return res.status(200).json({ message: "Audit deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete audit.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
