import {
  OnboardingRiskLevel,
  OnboardingRiskRating,
  OnboardingRiskStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { ensureProjectForPractice } from "../../services/onboarding/workstreamSync";

type RiskBody = {
  practiceId?: string;
  onboardingProjectId?: string;
  workstreamId?: string | null;
  description?: string;
  impact?: string;
  probability?: string;
  mitigation?: string | null;
  ownerUserId?: string | null;
  status?: string;
};

const LEVEL_SCORE: Record<OnboardingRiskLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

const riskInclude = {
  onboardingProject: {
    include: {
      practice: {
        select: { id: true, name: true },
      },
    },
  },
  workstream: {
    select: {
      id: true,
      serviceLine: true,
      status: true,
    },
  },
  owner: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.OnboardingRiskInclude;

function isRiskLevel(value: string): value is OnboardingRiskLevel {
  return Object.values(OnboardingRiskLevel).includes(
    value as OnboardingRiskLevel,
  );
}

function isRiskStatus(value: string): value is OnboardingRiskStatus {
  return Object.values(OnboardingRiskStatus).includes(
    value as OnboardingRiskStatus,
  );
}

export function computeRiskRating(
  impact: OnboardingRiskLevel,
  probability: OnboardingRiskLevel,
): OnboardingRiskRating {
  const product = LEVEL_SCORE[impact] * LEVEL_SCORE[probability];
  if (product >= 9) return OnboardingRiskRating.CRITICAL;
  if (product >= 6) return OnboardingRiskRating.HIGH;
  if (product >= 3) return OnboardingRiskRating.MEDIUM;
  return OnboardingRiskRating.LOW;
}

function serializeRisk(
  risk: Prisma.OnboardingRiskGetPayload<{ include: typeof riskInclude }>,
) {
  return {
    ...risk,
    practiceId: risk.onboardingProject.practice.id,
    practice: risk.onboardingProject.practice,
  };
}

async function nextRiskNumber(onboardingProjectId: string) {
  const last = await prisma.onboardingRisk.aggregate({
    where: { onboardingProjectId },
    _max: { riskNumber: true },
  });
  return (last._max.riskNumber ?? 0) + 1;
}

type ActionError = { error: string; status: number };

async function resolveProjectId(
  body: RiskBody,
): Promise<{ projectId: string } | ActionError> {
  if (body.onboardingProjectId) {
    const project = await prisma.onboardingProject.findFirst({
      where: { id: body.onboardingProjectId },
    });
    if (!project) {
      return { error: "Onboarding project not found." as const, status: 404 };
    }
    return { projectId: project.id };
  }

  if (body.practiceId) {
    const ensured = await ensureProjectForPractice(body.practiceId);
    if ("error" in ensured) {
      return {
        error: ensured.error ?? "Practice not found.",
        status: ensured.status ?? 404,
      };
    }
    return { projectId: ensured.project.id };
  }

  return {
    error: "practiceId or onboardingProjectId is required." as const,
    status: 400,
  };
}

async function validateWorkstream(
  workstreamId: string | null | undefined,
  projectId: string,
): Promise<{ workstreamId: string | null } | ActionError> {
  if (!workstreamId) return { workstreamId: null as string | null };

  const workstream = await prisma.onboardingWorkstream.findFirst({
    where: { id: workstreamId },
  });
  if (!workstream) {
    return { error: "Workstream not found." as const, status: 400 };
  }
  if (workstream.onboardingProjectId !== projectId) {
    return {
      error: "Workstream does not belong to this practice." as const,
      status: 400,
    };
  }
  return { workstreamId };
}

export async function getRisks(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 1000;
    const search = (req.query.search as string) || "";
    const practiceId = req.query.practiceId as string | undefined;
    const workstreamId = req.query.workstreamId as string | undefined;
    const status = req.query.status as string | undefined;
    const rating = req.query.rating as string | undefined;
    const impact = req.query.impact as string | undefined;
    const probability = req.query.probability as string | undefined;
    const ownerUserId = req.query.ownerUserId as string | undefined;
    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";
    const skip = (page - 1) * limit;

    if (status && !isRiskStatus(status)) {
      return res.status(400).json({
        message: "Invalid risk status.",
        allowedStatuses: Object.values(OnboardingRiskStatus),
      });
    }

    if (impact && !isRiskLevel(impact)) {
      return res.status(400).json({
        message: "Invalid impact.",
        allowedLevels: Object.values(OnboardingRiskLevel),
      });
    }

    if (probability && !isRiskLevel(probability)) {
      return res.status(400).json({
        message: "Invalid probability.",
        allowedLevels: Object.values(OnboardingRiskLevel),
      });
    }

    if (
      rating &&
      !Object.values(OnboardingRiskRating).includes(
        rating as OnboardingRiskRating,
      )
    ) {
      return res.status(400).json({
        message: "Invalid rating.",
        allowedRatings: Object.values(OnboardingRiskRating),
      });
    }

    const where: Prisma.OnboardingRiskWhereInput = {};

    if (practiceId) {
      where.onboardingProject = { practiceId };
    }

    if (search) {
      where.OR = [
        { description: { contains: search, mode: "insensitive" } },
        {
          onboardingProject: {
            practice: { name: { contains: search, mode: "insensitive" } },
          },
        },
      ];
    }

    if (workstreamId) {
      where.workstreamId = workstreamId;
    }
    if (status) where.status = status as OnboardingRiskStatus;
    if (rating) where.rating = rating as OnboardingRiskRating;
    if (impact) where.impact = impact as OnboardingRiskLevel;
    if (probability) where.probability = probability as OnboardingRiskLevel;
    if (ownerUserId) where.ownerUserId = ownerUserId;

    const [risks, total] = await Promise.all([
      prisma.onboardingRisk.findMany({
        where,
        include: riskInclude,
        orderBy: [{ riskNumber: sortOrder }, { updatedAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.onboardingRisk.count({ where }),
    ]);

    return res.status(200).json({
      message: "Risks fetched successfully.",
      risks: risks.map(serializeRisk),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch risks.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getRisk(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Risk id is required." });
    }

    const risk = await prisma.onboardingRisk.findFirst({
      where: { id },
      include: riskInclude,
    });

    if (!risk) {
      return res.status(404).json({ message: "Risk not found." });
    }

    return res.status(200).json({
      message: "Risk fetched successfully.",
      risk: serializeRisk(risk),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch risk.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createRisk(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      practiceId,
      onboardingProjectId,
      workstreamId,
      description,
      impact,
      probability,
      mitigation,
      ownerUserId,
      status,
    } = req.body as RiskBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const projectResult = await resolveProjectId({
      practiceId,
      onboardingProjectId,
    });
    if ("error" in projectResult) {
      return res
        .status(projectResult.status)
        .json({ message: projectResult.error });
    }

    const trimmedDescription = description?.trim();
    if (!trimmedDescription) {
      return res.status(400).json({ message: "Description is required." });
    }

    if (!impact || !isRiskLevel(impact)) {
      return res.status(400).json({
        message: "A valid impact is required.",
        allowedLevels: Object.values(OnboardingRiskLevel),
      });
    }

    if (!probability || !isRiskLevel(probability)) {
      return res.status(400).json({
        message: "A valid probability is required.",
        allowedLevels: Object.values(OnboardingRiskLevel),
      });
    }

    const nextStatus = status || OnboardingRiskStatus.OPEN;
    if (!isRiskStatus(nextStatus)) {
      return res.status(400).json({
        message: "Invalid risk status.",
        allowedStatuses: Object.values(OnboardingRiskStatus),
      });
    }

    if (ownerUserId) {
      const owner = await prisma.user.findFirst({ where: { id: ownerUserId } });
      if (!owner) {
        return res.status(400).json({ message: "Owner user not found." });
      }
    }

    const workstreamResult = await validateWorkstream(
      workstreamId,
      projectResult.projectId,
    );
    if ("error" in workstreamResult) {
      return res
        .status(workstreamResult.status)
        .json({ message: workstreamResult.error });
    }

    const riskNumber = await nextRiskNumber(projectResult.projectId);
    const rating = computeRiskRating(impact, probability);

    const risk = await prisma.onboardingRisk.create({
      data: {
        onboardingProjectId: projectResult.projectId,
        workstreamId: workstreamResult.workstreamId,
        riskNumber,
        description: trimmedDescription,
        impact,
        probability,
        rating,
        mitigation: mitigation?.trim() || null,
        ownerUserId: ownerUserId || null,
        status: nextStatus,
      },
      include: riskInclude,
    });

    return res.status(201).json({
      message: "Risk created successfully.",
      risk: serializeRisk(risk),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create risk.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateRisk(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const {
      workstreamId,
      description,
      impact,
      probability,
      mitigation,
      ownerUserId,
      status,
    } = req.body as RiskBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Risk id is required." });
    }

    const existing = await prisma.onboardingRisk.findFirst({
      where: { id },
    });
    if (!existing) {
      return res.status(404).json({ message: "Risk not found." });
    }

    const updateData: Prisma.OnboardingRiskUncheckedUpdateInput = {};

    if (workstreamId !== undefined) {
      const workstreamResult = await validateWorkstream(
        workstreamId,
        existing.onboardingProjectId,
      );
      if ("error" in workstreamResult) {
        return res
          .status(workstreamResult.status)
          .json({ message: workstreamResult.error });
      }
      updateData.workstreamId = workstreamResult.workstreamId;
    }

    if (description !== undefined) {
      const trimmedDescription = description.trim();
      if (!trimmedDescription) {
        return res.status(400).json({ message: "Description is required." });
      }
      updateData.description = trimmedDescription;
    }

    if (impact !== undefined) {
      if (!isRiskLevel(impact)) {
        return res.status(400).json({
          message: "Invalid impact.",
          allowedLevels: Object.values(OnboardingRiskLevel),
        });
      }
      updateData.impact = impact;
    }

    if (probability !== undefined) {
      if (!isRiskLevel(probability)) {
        return res.status(400).json({
          message: "Invalid probability.",
          allowedLevels: Object.values(OnboardingRiskLevel),
        });
      }
      updateData.probability = probability;
    }

    if (status !== undefined) {
      if (!isRiskStatus(status)) {
        return res.status(400).json({
          message: "Invalid risk status.",
          allowedStatuses: Object.values(OnboardingRiskStatus),
        });
      }
      updateData.status = status;
    }

    if (ownerUserId !== undefined) {
      if (ownerUserId) {
        const owner = await prisma.user.findFirst({
          where: { id: ownerUserId },
        });
        if (!owner) {
          return res.status(400).json({ message: "Owner user not found." });
        }
      }
      updateData.ownerUserId = ownerUserId || null;
    }

    if (mitigation !== undefined) {
      updateData.mitigation = mitigation?.trim() || null;
    }

    const nextImpact = (updateData.impact as OnboardingRiskLevel | undefined) ?? existing.impact;
    const nextProbability =
      (updateData.probability as OnboardingRiskLevel | undefined) ??
      existing.probability;
    updateData.rating = computeRiskRating(nextImpact, nextProbability);

    const risk = await prisma.onboardingRisk.update({
      where: { id },
      data: updateData,
      include: riskInclude,
    });

    return res.status(200).json({
      message: "Risk updated successfully.",
      risk: serializeRisk(risk),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update risk.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteRisk(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Risk id is required." });
    }

    const existing = await prisma.onboardingRisk.findFirst({
      where: { id },
    });
    if (!existing) {
      return res.status(404).json({ message: "Risk not found." });
    }

    await prisma.onboardingRisk.delete({ where: { id } });

    return res.status(200).json({
      message: "Risk deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete risk.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
