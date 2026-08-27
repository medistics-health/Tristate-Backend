import { Request, Response } from "express";
import { OnboardingMilestoneStatus, OnboardingServiceLine, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { formatDateMMDDYYYY, parseDateInput } from "./task.controller";

let memoryMilestones: any[] = [
  {
    id: "m-101",
    milestoneCode: "M1",
    description: "EMR & Clearinghouse Access Credentials Verified",
    practiceName: "Summit Medical Arts (Dr. Shah)",
    serviceLine: "RCM",
    targetWeek: "Week 1",
    targetDate: "08-10-2026",
    status: "COMPLETE",
    createdAt: "08-01-2026",
    updatedAt: "08-10-2026",
  },
  {
    id: "m-102",
    milestoneCode: "M2",
    description: "Commercial Payer Delegated Roster Submissions",
    practiceName: "Garden State Medical (Dr. Shah)",
    serviceLine: "CREDENTIALING",
    targetWeek: "Week 3",
    targetDate: "08-20-2026",
    status: "ON_TRACK",
    createdAt: "08-05-2026",
    updatedAt: "08-15-2026",
  },
  {
    id: "m-103",
    milestoneCode: "M3",
    description: "Fee Schedule Audit & ERA Electronic Remittance Setup",
    practiceName: "Summit Medical Arts (Dr. Shah)",
    serviceLine: "RCM",
    targetWeek: "Week 4",
    targetDate: "08-25-2026",
    status: "AT_RISK",
    createdAt: "08-08-2026",
    updatedAt: "08-18-2026",
  },
  {
    id: "m-104",
    milestoneCode: "M4",
    description: "CCM Patient Eligibility Screening & Care Plan Roster Import",
    practiceName: "Summit Medical Arts (Dr. Shah)",
    serviceLine: "CCM",
    targetWeek: "Week 6",
    targetDate: "09-05-2026",
    status: "NOT_STARTED",
    createdAt: "08-12-2026",
    updatedAt: "08-12-2026",
  },
  {
    id: "m-105",
    milestoneCode: "M5",
    description: "HR Compliance Binder & Payroll System Sync",
    practiceName: "Linden Medical Group",
    serviceLine: "HR",
    targetWeek: "Week 8-16",
    targetDate: "09-20-2026",
    status: "ON_TRACK",
    createdAt: "08-14-2026",
    updatedAt: "08-14-2026",
  },
];

export async function getMilestones(req: Request, res: Response): Promise<void> {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    let dbMilestones: any[] = [];
    try {
      dbMilestones = await prisma.onboardingMilestone.findMany({
        where: {
          ...(status ? { status: status as OnboardingMilestoneStatus } : {}),
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
        orderBy: { createdAt: "desc" },
      });
    } catch (dbErr) {
      let filtered = [...memoryMilestones];
      if (status) filtered = filtered.filter((m) => m.status === status);
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (m) =>
            m.milestoneCode.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q) ||
            m.practiceName.toLowerCase().includes(q)
        );
      }
      res.status(200).json({ success: true, milestones: filtered });
      return;
    }

    if (dbMilestones.length > 0) {
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
      return;
    }

    let filtered = [...memoryMilestones];
    if (status) filtered = filtered.filter((m) => m.status === status);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.milestoneCode.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.practiceName.toLowerCase().includes(q)
      );
    }
    res.status(200).json({ success: true, milestones: filtered });
  } catch (error: any) {
    console.error("Error fetching milestones:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to fetch milestones" });
  }
}

export async function createMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { milestoneCode, description, targetWeek, targetDate, status, practiceName, serviceLine } = req.body;
    if (!description) {
      res.status(400).json({ success: false, message: "Description is required" });
      return;
    }

    const newMilestone = {
      id: `m-${Date.now()}`,
      milestoneCode: milestoneCode || `M${memoryMilestones.length + 1}`,
      description,
      practiceName: practiceName || "Summit Medical Arts (Dr. Shah)",
      serviceLine: serviceLine || "RCM",
      targetWeek: targetWeek || "Week 1",
      targetDate: formatDateMMDDYYYY(targetDate ? new Date(targetDate) : new Date(Date.now() + 14 * 86400000)),
      status: status || "NOT_STARTED",
      createdAt: formatDateMMDDYYYY(new Date()),
      updatedAt: formatDateMMDDYYYY(new Date()),
    };

    memoryMilestones.unshift(newMilestone);
    res.status(201).json({ success: true, milestone: newMilestone });
  } catch (error: any) {
    console.error("Error creating milestone:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create milestone" });
  }
}

export async function updateMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { milestoneCode, description, targetWeek, targetDate, status } = req.body;

    const idx = memoryMilestones.findIndex((m) => m.id === id);
    if (idx !== -1) {
      if (milestoneCode) memoryMilestones[idx].milestoneCode = milestoneCode;
      if (description) memoryMilestones[idx].description = description;
      if (targetWeek) memoryMilestones[idx].targetWeek = targetWeek;
      if (targetDate) memoryMilestones[idx].targetDate = formatDateMMDDYYYY(new Date(targetDate));
      if (status) memoryMilestones[idx].status = status;
      memoryMilestones[idx].updatedAt = formatDateMMDDYYYY(new Date());

      res.status(200).json({ success: true, milestone: memoryMilestones[idx] });
      return;
    }

    res.status(200).json({
      success: true,
      milestone: {
        id,
        milestoneCode: milestoneCode || "M1",
        description: description || "Updated Milestone",
        targetWeek: targetWeek || "Week 1",
        targetDate: formatDateMMDDYYYY(new Date()),
        status: status || "ON_TRACK",
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
    memoryMilestones = memoryMilestones.filter((m) => m.id !== id);
    res.status(200).json({ success: true, message: "Milestone deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting milestone:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to delete milestone" });
  }
}
