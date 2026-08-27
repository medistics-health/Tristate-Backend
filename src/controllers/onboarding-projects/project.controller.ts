import { Request, Response } from "express";
import { OnboardingProjectStatus, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { formatDateMMDDYYYY, parseDateInput } from "./task.controller";

export async function getProjects(req: Request, res: Response): Promise<void> {
  try {
    const practiceId = typeof req.query.practiceId === "string" ? req.query.practiceId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const where: Prisma.OnboardingProjectWhereInput = {};

    if (practiceId) where.practiceId = practiceId;
    if (status) where.status = status as OnboardingProjectStatus;
    if (search) {
      where.practice = { name: { contains: search, mode: "insensitive" } };
    }

    let projects: any[] = [];
    try {
      projects = await prisma.onboardingProject.findMany({
        where,
        select: {
          id: true,
          practiceId: true,
          status: true,
          goLiveTarget: true,
          kickoffDate: true,
          practiceManagerId: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          practice: { select: { id: true, name: true, npi: true } },
          practiceManager: { select: { id: true, firstName: true, lastName: true, email: true } },
          workstreams: {
            select: {
              id: true,
              tasks: { select: { id: true, status: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    } catch (dbErr: any) {
      console.warn("Onboarding project table not found in DB yet (pending deployment). Returning empty list.");
      res.status(200).json({ success: true, projects: [] });
      return;
    }

    const formattedProjects = projects.map((p: any) => {
      const totalTasks = p.workstreams.reduce((sum: number, ws: any) => sum + ws.tasks.length, 0);
      const completedTasks = p.workstreams.reduce(
        (sum: number, ws: any) => sum + ws.tasks.filter((t: any) => t.status === "COMPLETE").length,
        0
      );
      const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return {
        id: p.id,
        practiceId: p.practiceId,
        practiceName: p.practice?.name || "Unknown Practice",
        status: p.status,
        goLiveTarget: formatDateMMDDYYYY(p.goLiveTarget),
        kickoffDate: formatDateMMDDYYYY(p.kickoffDate),
        practiceManagerId: p.practiceManagerId,
        practiceManagerName: p.practiceManager
          ? `${p.practiceManager.firstName} ${p.practiceManager.lastName}`.trim()
          : null,
        notes: p.notes,
        totalWorkstreams: p.workstreams.length,
        totalTasks,
        completedTasks,
        progressPct,
        createdAt: formatDateMMDDYYYY(p.createdAt),
        updatedAt: formatDateMMDDYYYY(p.updatedAt),
      };
    });

    res.status(200).json({ success: true, projects: formattedProjects });
  } catch (error: any) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to fetch projects" });
  }
}

export async function createProject(req: Request, res: Response): Promise<void> {
  try {
    const { practiceId, kickoffDate, goLiveTarget, practiceManagerId, notes } = req.body;
    if (!practiceId) {
      res.status(400).json({ success: false, message: "practiceId is required" });
      return;
    }

    const project = await prisma.onboardingProject.create({
      data: {
        practiceId,
        status: OnboardingProjectStatus.NOT_STARTED,
        kickoffDate: parseDateInput(kickoffDate),
        goLiveTarget: parseDateInput(goLiveTarget),
        practiceManagerId,
        notes,
      },
      select: {
        id: true,
        practiceId: true,
        status: true,
        kickoffDate: true,
        goLiveTarget: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        practice: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({
      success: true,
      project: {
        id: project.id,
        practiceId: project.practiceId,
        practiceName: project.practice?.name || "Unknown Practice",
        status: project.status,
        kickoffDate: formatDateMMDDYYYY(project.kickoffDate),
        goLiveTarget: formatDateMMDDYYYY(project.goLiveTarget),
        notes: project.notes,
        createdAt: formatDateMMDDYYYY(project.createdAt),
        updatedAt: formatDateMMDDYYYY(project.updatedAt),
      },
    });
  } catch (error: any) {
    console.error("Error creating project:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create project" });
  }
}

export async function updateProject(req: Request, res: Response): Promise<void> {
  try {
    const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status, kickoffDate, goLiveTarget, practiceManagerId, notes } = req.body;

    const project = await prisma.onboardingProject.update({
      where: { id: projectId },
      data: {
        ...(status ? { status: status as OnboardingProjectStatus } : {}),
        ...(kickoffDate !== undefined ? { kickoffDate: parseDateInput(kickoffDate) } : {}),
        ...(goLiveTarget !== undefined ? { goLiveTarget: parseDateInput(goLiveTarget) } : {}),
        ...(practiceManagerId !== undefined ? { practiceManagerId } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
      select: {
        id: true,
        practiceId: true,
        status: true,
        kickoffDate: true,
        goLiveTarget: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        practice: { select: { id: true, name: true } },
      },
    });

    res.status(200).json({
      success: true,
      project: {
        id: project.id,
        practiceId: project.practiceId,
        practiceName: project.practice?.name || "Unknown Practice",
        status: project.status,
        kickoffDate: formatDateMMDDYYYY(project.kickoffDate),
        goLiveTarget: formatDateMMDDYYYY(project.goLiveTarget),
        notes: project.notes,
        createdAt: formatDateMMDDYYYY(project.createdAt),
        updatedAt: formatDateMMDDYYYY(project.updatedAt),
      },
    });
  } catch (error: any) {
    console.error("Error updating project:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update project" });
  }
}
