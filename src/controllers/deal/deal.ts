import { DealStage } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type DealBody = {
  practiceId?: string;
  stage?: string;
  value?: number;
  probability?: number;
  expectedCloseDate?: string;
};

function isDealStage(stage: string): stage is DealStage {
  return Object.values(DealStage).includes(stage as DealStage);
}

export async function createDeal(req: AuthenticatedRequest, res: Response) {
  try {
    const { practiceId, stage, value, probability, expectedCloseDate } =
      req.body as DealBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (
      !practiceId ||
      !stage ||
      value === undefined ||
      probability === undefined
    ) {
      return res.status(400).json({
        message: "practiceId, stage, value and probability are required.",
      });
    }

    if (!isDealStage(stage)) {
      return res.status(400).json({
        message: "Invalid deal stage.",
        allowedStages: Object.values(DealStage),
      });
    }

    const practice = await prisma.practice.findFirst({
      where: { id: practiceId, ownerId: req.user.sub },
    });

    if (!practice) {
      return res.status(404).json({ message: "Practice not found." });
    }

    const deal = await prisma.deal.create({
      data: {
        practiceId,
        stage,
        value,
        probability,
        expectedCloseDate: expectedCloseDate
          ? new Date(expectedCloseDate)
          : undefined,
      },
    });

    return res
      .status(201)
      .json({ message: "Deal created successfully.", deal });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create deal.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getDeal(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Deal id is required." });
    }

    const deal = await prisma.deal.findFirst({
      where: { id, practice: { ownerId: req.user.sub } },
      include: { practice: true, agreements: true, audits: true },
    });

    if (!deal) {
      return res.status(404).json({ message: "Deal not found." });
    }

    return res.status(200).json({ message: "Deal fetched successfully.", deal });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch deal.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateDeal(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { stage, value, probability, expectedCloseDate } = req.body as DealBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Deal id is required." });
    }

    if (stage !== undefined && !isDealStage(stage)) {
      return res.status(400).json({
        message: "Invalid deal stage.",
        allowedStages: Object.values(DealStage),
      });
    }

    const existingDeal = await prisma.deal.findFirst({
      where: { id, practice: { ownerId: req.user.sub } },
    });

    if (!existingDeal) {
      return res.status(404).json({ message: "Deal not found." });
    }

    const updateData: {
      stage?: DealStage;
      value?: number;
      probability?: number;
      expectedCloseDate?: Date | null;
    } = {};

    if (stage !== undefined) updateData.stage = stage as DealStage;
    if (value !== undefined) updateData.value = value;
    if (probability !== undefined) updateData.probability = probability;
    if (expectedCloseDate !== undefined) {
      updateData.expectedCloseDate = expectedCloseDate
        ? new Date(expectedCloseDate)
        : null;
    }

    const deal = await prisma.deal.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({ message: "Deal updated successfully.", deal });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update deal.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteDeal(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Deal id is required." });
    }

    const existingDeal = await prisma.deal.findFirst({
      where: { id, practice: { ownerId: req.user.sub } },
    });

    if (!existingDeal) {
      return res.status(404).json({ message: "Deal not found." });
    }

    await prisma.deal.delete({ where: { id } });

    return res.status(200).json({ message: "Deal deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete deal.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
