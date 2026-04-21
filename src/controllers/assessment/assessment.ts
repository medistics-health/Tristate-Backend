import { Prisma } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type AssessmentBody = {
  practiceId?: string;
  responses?: unknown;
  score?: number;
};

export async function createAssessment(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { practiceId, responses, score } = req.body as AssessmentBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!practiceId || responses === undefined || responses === null) {
      return res.status(400).json({
        message: "practiceId and responses are required. responses cannot be null.",
      });
    }

    const practice = await prisma.practice.findFirst({
      where: { id: practiceId },
    });

    if (!practice) {
      return res.status(404).json({ message: "Practice not found." });
    }

    const assessment = await prisma.assessment.create({
      data: { practiceId, responses: responses as Prisma.InputJsonValue, score },
    });

    return res.status(201).json({
      message: "Assessment created successfully.",
      assessment,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create assessment.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAssessment(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Assessment id is required." });
    }

    const assessment = await prisma.assessment.findFirst({
      where: { id,  },
      include: { practice: true },
    });

    if (!assessment) {
      return res.status(404).json({ message: "Assessment not found." });
    }

    return res.status(200).json({
      message: "Assessment fetched successfully.",
      assessment,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch assessment.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateAssessment(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { responses, score } = req.body as AssessmentBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Assessment id is required." });
    }

    const existingAssessment = await prisma.assessment.findFirst({
      where: { id,  },
    });

    if (!existingAssessment) {
      return res.status(404).json({ message: "Assessment not found." });
    }

    const updateData: Prisma.AssessmentUncheckedUpdateInput = {};

    if (responses !== undefined) {
      if (responses === null) {
        return res.status(400).json({
          message: "responses cannot be null.",
        });
      }

      updateData.responses = responses as Prisma.InputJsonValue;
    }

    if (score !== undefined) {
      updateData.score = score;
    }

    const assessment = await prisma.assessment.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      message: "Assessment updated successfully.",
      assessment,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update assessment.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteAssessment(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Assessment id is required." });
    }

    const existingAssessment = await prisma.assessment.findFirst({
      where: { id,  },
    });

    if (!existingAssessment) {
      return res.status(404).json({ message: "Assessment not found." });
    }

    await prisma.assessment.delete({ where: { id } });

    return res.status(200).json({
      message: "Assessment deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete assessment.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAllAssessments(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.practice = {
        ...where.practice,
        name: { contains: search, mode: "insensitive" },
      };
    }

    const [assessments, total] = await Promise.all([
      prisma.assessment.findMany({
        where,
        include: { practice: true },
        orderBy: { createdAt: sortOrder },
        skip,
        take: limit,
      }),
      prisma.assessment.count({ where }),
    ]);

    return res.status(200).json({
      message: "Assessments fetched successfully.",
      assessments,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch assessments.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

