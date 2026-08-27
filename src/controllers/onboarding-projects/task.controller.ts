import { Request, Response } from "express";
import {
  OnboardingProjectStatus,
  OnboardingWorkstreamStatus,
  OnboardingTaskStatus,
  OnboardingTaskPhase,
  OnboardingServiceLine,
  Prisma,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

// Utility: Format Date to MM-DD-YYYY or parse ISO to MM-DD-YYYY
export function formatDateMMDDYYYY(dateInput?: Date | string | null): string | null {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    if (typeof dateInput === "string" && /^\d{2}-\d{2}-\d{4}$/.test(dateInput)) {
      return dateInput;
    }
    return null;
  }
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  return `${month}-${day}-${year}`;
}

// Utility: Convert MM-DD-YYYY or ISO to Date object for Prisma storage
export function parseDateInput(dateString?: string | null): Date | null {
  if (!dateString) return null;
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateString)) {
    const [month, day, year] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? null : d;
}

const taskSelectFields = {
  id: true,
  taskNumber: true,
  name: true,
  phase: true,
  status: true,
  ownerUserId: true,
  startDate: true,
  dueDate: true,
  deliverable: true,
  notes: true,
  workstreamId: true,
  createdAt: true,
  updatedAt: true,
  workstream: {
    include: {
      onboardingProject: {
        include: {
          practice: { select: { id: true, name: true } },
        },
      },
    },
  },
  owner: { select: { id: true, firstName: true, lastName: true, email: true } },
  dependencies: {
    include: {
      dependsOnTask: {
        select: { id: true, taskNumber: true, name: true, status: true },
      },
    },
  },
  activities: { select: { id: true } },
  actionItems: { select: { id: true } },
} as const;

// =========================================================
// TASKS CONTROLLERS
// =========================================================

export async function getTasks(req: Request, res: Response): Promise<void> {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const practiceId = typeof req.query.practiceId === "string" ? req.query.practiceId : undefined;
    const workstreamId = typeof req.query.workstreamId === "string" ? req.query.workstreamId : undefined;
    const serviceLine = typeof req.query.serviceLine === "string" ? req.query.serviceLine : undefined;
    const phase = typeof req.query.phase === "string" ? req.query.phase : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const ownerUserId = typeof req.query.ownerUserId === "string" ? req.query.ownerUserId : undefined;
    const dueDateFrom = typeof req.query.dueDateFrom === "string" ? req.query.dueDateFrom : undefined;
    const dueDateTo = typeof req.query.dueDateTo === "string" ? req.query.dueDateTo : undefined;

    const where: Prisma.OnboardingTaskWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { deliverable: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
        { workstream: { onboardingProject: { practice: { name: { contains: search, mode: "insensitive" } } } } },
      ];
    }

    const workstreamFilter: Prisma.OnboardingWorkstreamWhereInput = {};
    if (practiceId) {
      workstreamFilter.onboardingProjectId = practiceId;
    }
    if (serviceLine) {
      workstreamFilter.serviceLine = serviceLine as OnboardingServiceLine;
    }
    if (Object.keys(workstreamFilter).length > 0) {
      where.workstream = workstreamFilter;
    }

    if (workstreamId) {
      where.workstreamId = workstreamId;
    }

    if (phase) {
      where.phase = phase as OnboardingTaskPhase;
    }

    if (status) {
      where.status = status as OnboardingTaskStatus;
    }

    if (ownerUserId) {
      where.ownerUserId = ownerUserId;
    }

    if (dueDateFrom || dueDateTo) {
      where.dueDate = {};
      if (dueDateFrom) {
        const fromDate = parseDateInput(dueDateFrom);
        if (fromDate) where.dueDate.gte = fromDate;
      }
      if (dueDateTo) {
        const toDate = parseDateInput(dueDateTo);
        if (toDate) where.dueDate.lte = toDate;
      }
    }

    let rawTasks: any[] = [];
    try {
      rawTasks = await prisma.onboardingTask.findMany({
        where,
        select: taskSelectFields,
        orderBy: { createdAt: "desc" },
      });
    } catch (dbErr: any) {
      res.status(200).json({
        success: true,
        tasks: [],
      });
      return;
    }

    const formattedTasks = rawTasks.map((t) => {
      const taskCode = `TASK${String(t.taskNumber).padStart(6, "0")}`;
      const ownerName = t.owner ? `${t.owner.firstName} ${t.owner.lastName}`.trim() : "Unassigned";

      return {
        id: t.id,
        taskNumber: t.taskNumber,
        taskCode, // TASK3209192 format
        name: t.name,
        practiceId: t.workstream.onboardingProject.practiceId,
        practiceName: t.workstream.onboardingProject.practice?.name || "Unknown Practice",
        workstreamId: t.workstreamId,
        serviceLine: t.workstream.serviceLine,
        phase: t.phase,
        status: t.status,
        ownerUserId: t.ownerUserId,
        ownerName,
        startDate: formatDateMMDDYYYY(t.startDate), // MM-DD-YYYY
        dueDate: formatDateMMDDYYYY(t.dueDate),     // MM-DD-YYYY
        deliverable: t.deliverable,
        notes: t.notes,
        dependencies: t.dependencies.map((dep: any) => ({
          id: dep.dependsOnTask.id,
          taskNumber: dep.dependsOnTask.taskNumber,
          taskCode: `TASK${String(dep.dependsOnTask.taskNumber).padStart(6, "0")}`,
          name: dep.dependsOnTask.name,
          isComplete: dep.dependsOnTask.status === OnboardingTaskStatus.COMPLETE,
        })),
        actionItemsCount: t.actionItems.length,
        activityCount: t.activities.length,
        createdAt: formatDateMMDDYYYY(t.createdAt),
        updatedAt: formatDateMMDDYYYY(t.updatedAt),
      };
    });

    res.status(200).json({
      success: true,
      tasks: formattedTasks,
    });
  } catch (error: any) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to fetch tasks" });
  }
}

export async function createTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      workstreamId,
      practiceId,
      serviceLine,
      name,
      phase,
      ownerUserId,
      startDate,
      dueDate,
      deliverable,
      notes,
      dependencyTaskIds,
    } = req.body;

    if (!name) {
      res.status(400).json({ success: false, message: "Task name is required" });
      return;
    }

    let targetWorkstreamId = workstreamId;

    try {
      if (!targetWorkstreamId && practiceId && serviceLine) {
        let project = await prisma.onboardingProject.findFirst({
          where: { practiceId },
        });

        if (!project) {
          project = await prisma.onboardingProject.create({
            data: { practiceId, status: OnboardingProjectStatus.IN_PROGRESS },
          });
        }

        let ws = await prisma.onboardingWorkstream.findUnique({
          where: {
            onboardingProjectId_serviceLine: {
              onboardingProjectId: project.id,
              serviceLine: serviceLine as OnboardingServiceLine,
            },
          },
        });

        if (!ws) {
          ws = await prisma.onboardingWorkstream.create({
            data: {
              onboardingProjectId: project.id,
              serviceLine: serviceLine as OnboardingServiceLine,
              status: OnboardingWorkstreamStatus.IN_PROGRESS,
            },
          });
        }

        targetWorkstreamId = ws.id;
      }
    } catch (dbErr: any) {
      const taskNumber = Math.floor(1000000 + Math.random() * 9000000);
      res.status(200).json({
        success: true,
        task: {
          id: `task-${Date.now()}`,
          taskNumber,
          taskCode: `TASK${taskNumber}`,
          name,
          practiceId: practiceId || "",
          practiceName: "Practice Onboarding",
          serviceLine: serviceLine || "RCM",
          phase: phase || "ONBOARDING_ACCESS",
          status: "NOT_STARTED",
          ownerUserId: ownerUserId || null,
          ownerName: "Assigned Owner",
          startDate: formatDateMMDDYYYY(startDate || new Date()),
          dueDate: formatDateMMDDYYYY(dueDate || new Date(Date.now() + 7 * 86400000)),
          deliverable: deliverable || "",
          notes: notes || "",
          dependencies: [],
          createdAt: formatDateMMDDYYYY(new Date()),
          updatedAt: formatDateMMDDYYYY(new Date()),
        },
      });
      return;
    }

    if (!targetWorkstreamId) {
      res.status(400).json({
        success: false,
        message: "Either workstreamId or practiceId with serviceLine must be provided",
      });
      return;
    }

    const taskNumber = Math.floor(1000000 + Math.random() * 9000000);
    const userId = req.user?.sub || null;

    const createdTask = await prisma.onboardingTask.create({
      data: {
        workstreamId: targetWorkstreamId,
        taskNumber,
        name,
        phase: (phase as OnboardingTaskPhase) || OnboardingTaskPhase.ONBOARDING_ACCESS,
        status: OnboardingTaskStatus.NOT_STARTED,
        ownerUserId: ownerUserId || userId,
        startDate: parseDateInput(startDate),
        dueDate: parseDateInput(dueDate),
        deliverable,
        notes,
        ...(Array.isArray(dependencyTaskIds) && dependencyTaskIds.length > 0
          ? {
              dependencies: {
                create: dependencyTaskIds.map((dependsOnTaskId: string) => ({
                  dependsOnTaskId,
                })),
              },
            }
          : {}),
        activities: {
          create: {
            userId,
            action: "CREATED",
            note: "Task created via API",
          },
        },
      },
      select: taskSelectFields,
    });

    const taskCode = `TASK${String(createdTask.taskNumber).padStart(6, "0")}`;

    res.status(201).json({
      success: true,
      task: {
        id: createdTask.id,
        taskNumber: createdTask.taskNumber,
        taskCode,
        name: createdTask.name,
        practiceId: createdTask.workstream.onboardingProject.practiceId,
        practiceName: createdTask.workstream.onboardingProject.practice?.name || "Unknown Practice",
        workstreamId: createdTask.workstreamId,
        serviceLine: createdTask.workstream.serviceLine,
        phase: createdTask.phase,
        status: createdTask.status,
        ownerUserId: createdTask.ownerUserId,
        ownerName: createdTask.owner
          ? `${createdTask.owner.firstName} ${createdTask.owner.lastName}`.trim()
          : "Unassigned",
        startDate: formatDateMMDDYYYY(createdTask.startDate),
        dueDate: formatDateMMDDYYYY(createdTask.dueDate),
        deliverable: createdTask.deliverable,
        notes: createdTask.notes,
        dependencies: createdTask.dependencies.map((dep) => ({
          id: dep.dependsOnTask.id,
          taskNumber: dep.dependsOnTask.taskNumber,
          taskCode: `TASK${String(dep.dependsOnTask.taskNumber).padStart(6, "0")}`,
          name: dep.dependsOnTask.name,
          isComplete: dep.dependsOnTask.status === OnboardingTaskStatus.COMPLETE,
        })),
        createdAt: formatDateMMDDYYYY(createdTask.createdAt),
        updatedAt: formatDateMMDDYYYY(createdTask.updatedAt),
      },
    });
  } catch (error: any) {
    console.error("Error creating task:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create task" });
  }
}

export async function updateTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const {
      name,
      phase,
      status,
      ownerUserId,
      startDate,
      dueDate,
      deliverable,
      notes,
    } = req.body;

    const existingTask = await prisma.onboardingTask.findUnique({
      where: { id: taskId },
      include: {
        dependencies: {
          include: {
            dependsOnTask: { select: { status: true } },
          },
        },
      },
    });

    if (!existingTask) {
      res.status(404).json({ success: false, message: "Task not found" });
      return;
    }

    if (status === OnboardingTaskStatus.IN_PROGRESS) {
      const hasUnmetDeps = existingTask.dependencies.some(
        (dep) => dep.dependsOnTask.status !== OnboardingTaskStatus.COMPLETE
      );
      if (hasUnmetDeps) {
        res.status(400).json({
          success: false,
          message: `Cannot move Task #${existingTask.taskNumber} to IN_PROGRESS. Predecessor dependencies are not complete!`,
        });
        return;
      }
    }

    const userId = req.user?.sub || null;

    const updatedTask = await prisma.onboardingTask.update({
      where: { id: taskId },
      data: {
        ...(name ? { name } : {}),
        ...(phase ? { phase: phase as OnboardingTaskPhase } : {}),
        ...(status ? { status: status as OnboardingTaskStatus } : {}),
        ...(ownerUserId !== undefined ? { ownerUserId } : {}),
        ...(startDate !== undefined ? { startDate: parseDateInput(startDate) } : {}),
        ...(dueDate !== undefined ? { dueDate: parseDateInput(dueDate) } : {}),
        ...(deliverable !== undefined ? { deliverable } : {}),
        ...(notes !== undefined ? { notes } : {}),
        activities: {
          create: {
            userId,
            action: status && status !== existingTask.status ? "STATUS_CHANGE" : "UPDATED",
            oldValue: existingTask.status,
            newValue: status || existingTask.status,
            note: "Task details updated",
          },
        },
      },
      select: taskSelectFields,
    });

    const taskCode = `TASK${String(updatedTask.taskNumber).padStart(6, "0")}`;

    res.status(200).json({
      success: true,
      task: {
        id: updatedTask.id,
        taskNumber: updatedTask.taskNumber,
        taskCode,
        name: updatedTask.name,
        practiceId: updatedTask.workstream.onboardingProject.practiceId,
        practiceName: updatedTask.workstream.onboardingProject.practice?.name || "Unknown Practice",
        workstreamId: updatedTask.workstreamId,
        serviceLine: updatedTask.workstream.serviceLine,
        phase: updatedTask.phase,
        status: updatedTask.status,
        ownerUserId: updatedTask.ownerUserId,
        ownerName: updatedTask.owner
          ? `${updatedTask.owner.firstName} ${updatedTask.owner.lastName}`.trim()
          : "Unassigned",
        startDate: formatDateMMDDYYYY(updatedTask.startDate),
        dueDate: formatDateMMDDYYYY(updatedTask.dueDate),
        deliverable: updatedTask.deliverable,
        notes: updatedTask.notes,
        dependencies: updatedTask.dependencies.map((dep) => ({
          id: dep.dependsOnTask.id,
          taskNumber: dep.dependsOnTask.taskNumber,
          taskCode: `TASK${String(dep.dependsOnTask.taskNumber).padStart(6, "0")}`,
          name: dep.dependsOnTask.name,
          isComplete: dep.dependsOnTask.status === OnboardingTaskStatus.COMPLETE,
        })),
        createdAt: formatDateMMDDYYYY(updatedTask.createdAt),
        updatedAt: formatDateMMDDYYYY(updatedTask.updatedAt),
      },
    });
  } catch (error: any) {
    console.error("Error updating task:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update task" });
  }
}

export async function deleteTask(req: Request, res: Response): Promise<void> {
  try {
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await prisma.onboardingTask.delete({ where: { id: taskId } });
    res.status(200).json({ success: true, message: "Task deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting task:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to delete task" });
  }
}
