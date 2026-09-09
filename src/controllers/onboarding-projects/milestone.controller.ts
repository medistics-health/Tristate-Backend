import { Request, Response } from "express";
import { OnboardingMilestoneStatus, OnboardingServiceLine, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { formatDateMMDDYYYY, parseDateInput } from "./task.controller";

export async function getMilestones(req: Request, res: Response): Promise<void> {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const serviceLine = typeof req.query.serviceLine === "string" ? req.query.serviceLine : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const dbMilestones = await prisma.onboardingMilestone.findMany({
      where: {
        ...(status ? { status: status as OnboardingMilestoneStatus } : {}),
        ...(serviceLine ? { workstream: { serviceLine: serviceLine as OnboardingServiceLine } } : {}),
        ...(search
          ? {
              OR: [
                { milestoneCode: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        workstream: {
          include: {
            onboardingProject: {
              include: {
                practice: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const formatted = dbMilestones.map((m: any) => ({
      id: m.id,
      milestoneCode: m.milestoneCode,
      description: m.description,
      practiceName: m.workstream?.onboardingProject?.practice?.name || "Practice Onboarding",
      serviceLine: m.workstream?.serviceLine || "RCM",
      targetWeek: m.targetWeek || "Week 1",
      targetDate: formatDateMMDDYYYY(m.targetDate),
      status: m.status,
      createdAt: formatDateMMDDYYYY(m.createdAt),
      updatedAt: formatDateMMDDYYYY(m.updatedAt),
    }));

    res.status(200).json({ success: true, milestones: formatted });
  } catch (error: any) {
    console.error("Error fetching milestones:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to fetch milestones" });
  }
}

export async function createMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      milestoneCode,
      description,
      targetWeek,
      targetDate,
      status,
      practiceName,
      serviceLine,
      workstreamId,
    } = req.body;

    if (!description) {
      res.status(400).json({ success: false, message: "Description is required" });
      return;
    }

    let resolvedWorkstreamId = workstreamId;

    if (!resolvedWorkstreamId) {
      // Find an existing workstream to attach this milestone to
      const targetServiceLine = (serviceLine as OnboardingServiceLine) || OnboardingServiceLine.RCM;
      let matchedWorkstream: any = null;

      if (practiceName) {
        matchedWorkstream = await prisma.onboardingWorkstream.findFirst({
          where: {
            serviceLine: targetServiceLine,
            onboardingProject: {
              practice: {
                name: { contains: practiceName, mode: "insensitive" },
              },
            },
          },
        });
      }

      if (!matchedWorkstream) {
        matchedWorkstream = await prisma.onboardingWorkstream.findFirst({
          where: { serviceLine: targetServiceLine },
        });
      }

      if (!matchedWorkstream) {
        matchedWorkstream = await prisma.onboardingWorkstream.findFirst();
      }

      resolvedWorkstreamId = matchedWorkstream?.id;
    }

    if (!resolvedWorkstreamId) {
      res.status(400).json({
        success: false,
        message: "A workstream is required to create a milestone. Please create a workstream first.",
      });
      return;
    }

    // Auto-generate milestone code if not provided
    let finalCode = milestoneCode;
    if (!finalCode) {
      const count = await prisma.onboardingMilestone.count({
        where: { workstreamId: resolvedWorkstreamId },
      });
      const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      finalCode = `M${count + 1}${randomCode}`;
    }

    const created = await prisma.onboardingMilestone.create({
      data: {
        workstreamId: resolvedWorkstreamId,
        milestoneCode: finalCode,
        description,
        targetWeek: targetWeek || "Week 1",
        targetDate: parseDateInput(targetDate) || new Date(Date.now() + 14 * 86400000),
        status: (status as OnboardingMilestoneStatus) || OnboardingMilestoneStatus.NOT_STARTED,
      },
      include: {
        workstream: {
          include: {
            onboardingProject: {
              include: {
                practice: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      milestone: {
        id: created.id,
        milestoneCode: created.milestoneCode,
        description: created.description,
        practiceName: created.workstream?.onboardingProject?.practice?.name || practiceName || "Practice Onboarding",
        serviceLine: created.workstream?.serviceLine || serviceLine || "RCM",
        targetWeek: created.targetWeek || "Week 1",
        targetDate: formatDateMMDDYYYY(created.targetDate),
        status: created.status,
        createdAt: formatDateMMDDYYYY(created.createdAt),
        updatedAt: formatDateMMDDYYYY(created.updatedAt),
      },
    });
  } catch (error: any) {
    console.error("Error creating milestone:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create milestone" });
  }
}

export async function updateMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { milestoneCode, description, targetWeek, targetDate, status } = req.body;

    const existing = await prisma.onboardingMilestone.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: "Milestone not found" });
      return;
    }

    const updated = await prisma.onboardingMilestone.update({
      where: { id },
      data: {
        ...(milestoneCode ? { milestoneCode } : {}),
        ...(description ? { description } : {}),
        ...(targetWeek !== undefined ? { targetWeek } : {}),
        ...(targetDate !== undefined ? { targetDate: parseDateInput(targetDate) } : {}),
        ...(status ? { status: status as OnboardingMilestoneStatus } : {}),
      },
      include: {
        workstream: {
          include: {
            onboardingProject: {
              include: {
                practice: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      milestone: {
        id: updated.id,
        milestoneCode: updated.milestoneCode,
        description: updated.description,
        practiceName: updated.workstream?.onboardingProject?.practice?.name || "Practice Onboarding",
        serviceLine: updated.workstream?.serviceLine || "RCM",
        targetWeek: updated.targetWeek || "Week 1",
        targetDate: formatDateMMDDYYYY(updated.targetDate),
        status: updated.status,
        createdAt: formatDateMMDDYYYY(updated.createdAt),
        updatedAt: formatDateMMDDYYYY(updated.updatedAt),
      },
    });
  } catch (error: any) {
    console.error("Error updating milestone:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update milestone" });
  }
}

export async function deleteMilestone(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const existing = await prisma.onboardingMilestone.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, message: "Milestone not found" });
      return;
    }

    await prisma.onboardingMilestone.delete({ where: { id } });
    res.status(200).json({ success: true, message: "Milestone deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting milestone:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to delete milestone" });
  }
}
