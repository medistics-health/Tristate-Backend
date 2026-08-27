import {
  OnboardingActionItemStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { ensureProjectForPractice } from "../../services/onboarding/workstreamSync";

type ActionItemBody = {
  practiceId?: string;
  onboardingProjectId?: string;
  taskId?: string | null;
  note?: string;
  responsibleUserId?: string | null;
  status?: string;
};

const actionItemInclude = {
  onboardingProject: {
    include: {
      practice: {
        select: { id: true, name: true },
      },
    },
  },
  task: {
    select: {
      id: true,
      taskNumber: true,
      name: true,
      status: true,
      workstream: {
        select: {
          id: true,
          serviceLine: true,
        },
      },
    },
  },
  responsibleUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  loggedByUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.OnboardingActionItemInclude;

function isActionStatus(value: string): value is OnboardingActionItemStatus {
  return Object.values(OnboardingActionItemStatus).includes(
    value as OnboardingActionItemStatus,
  );
}

function serializeActionItem(
  item: Prisma.OnboardingActionItemGetPayload<{
    include: typeof actionItemInclude;
  }>,
) {
  return {
    ...item,
    practiceId: item.onboardingProject.practice.id,
    practice: item.onboardingProject.practice,
  };
}

type ActionError = { error: string; status: number };

async function resolveProjectId(
  body: Pick<ActionItemBody, "practiceId" | "onboardingProjectId">,
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

async function validateTask(
  taskId: string | null | undefined,
  projectId: string,
): Promise<{ taskId: string | null } | ActionError> {
  if (!taskId) return { taskId: null as string | null };

  const task = await prisma.onboardingTask.findFirst({
    where: { id: taskId },
    include: {
      workstream: { select: { onboardingProjectId: true } },
    },
  });
  if (!task) {
    return { error: "Task not found." as const, status: 400 };
  }
  if (task.workstream.onboardingProjectId !== projectId) {
    return {
      error: "Task does not belong to this practice." as const,
      status: 400,
    };
  }
  return { taskId };
}

function parseDayBoundary(value: string | undefined, endOfDay: boolean) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { error: true as const };
  }
  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }
  return { value: parsed };
}

export async function getActionItems(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 1000;
    const search = (req.query.search as string) || "";
    const practiceId = req.query.practiceId as string | undefined;
    const taskId = req.query.taskId as string | undefined;
    const status = req.query.status as string | undefined;
    const responsibleUserId = req.query.responsibleUserId as string | undefined;
    const loggedByUserId = req.query.loggedByUserId as string | undefined;
    const loggedFrom = req.query.loggedFrom as string | undefined;
    const loggedTo = req.query.loggedTo as string | undefined;
    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";
    const skip = (page - 1) * limit;

    if (status && !isActionStatus(status)) {
      return res.status(400).json({
        message: "Invalid action item status.",
        allowedStatuses: Object.values(OnboardingActionItemStatus),
      });
    }

    const fromResult = parseDayBoundary(loggedFrom, false);
    if (fromResult && "error" in fromResult) {
      return res.status(400).json({ message: "Invalid loggedFrom date." });
    }
    const toResult = parseDayBoundary(loggedTo, true);
    if (toResult && "error" in toResult) {
      return res.status(400).json({ message: "Invalid loggedTo date." });
    }

    const where: Prisma.OnboardingActionItemWhereInput = {};

    if (practiceId) {
      where.onboardingProject = { practiceId };
    }

    if (search) {
      where.OR = [
        { note: { contains: search, mode: "insensitive" } },
        {
          onboardingProject: {
            practice: { name: { contains: search, mode: "insensitive" } },
          },
        },
        {
          task: { name: { contains: search, mode: "insensitive" } },
        },
      ];
    }

    if (taskId) where.taskId = taskId;
    if (status) where.status = status as OnboardingActionItemStatus;
    if (responsibleUserId) where.responsibleUserId = responsibleUserId;
    if (loggedByUserId) where.loggedByUserId = loggedByUserId;

    if (fromResult?.value || toResult?.value) {
      where.loggedAt = {};
      if (fromResult?.value) where.loggedAt.gte = fromResult.value;
      if (toResult?.value) where.loggedAt.lte = toResult.value;
    }

    const [actionItems, total] = await Promise.all([
      prisma.onboardingActionItem.findMany({
        where,
        include: actionItemInclude,
        orderBy: [{ loggedAt: sortOrder }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.onboardingActionItem.count({ where }),
    ]);

    return res.status(200).json({
      message: "Action items fetched successfully.",
      actionItems: actionItems.map(serializeActionItem),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch action items.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getActionItem(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Action item id is required." });
    }

    const actionItem = await prisma.onboardingActionItem.findFirst({
      where: { id },
      include: actionItemInclude,
    });

    if (!actionItem) {
      return res.status(404).json({ message: "Action item not found." });
    }

    return res.status(200).json({
      message: "Action item fetched successfully.",
      actionItem: serializeActionItem(actionItem),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch action item.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createActionItem(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const {
      practiceId,
      onboardingProjectId,
      taskId,
      note,
      responsibleUserId,
      status,
    } = req.body as ActionItemBody;

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

    const trimmedNote = note?.trim();
    if (!trimmedNote) {
      return res.status(400).json({ message: "Note is required." });
    }

    const nextStatus = status || OnboardingActionItemStatus.PENDING;
    if (!isActionStatus(nextStatus)) {
      return res.status(400).json({
        message: "Invalid action item status.",
        allowedStatuses: Object.values(OnboardingActionItemStatus),
      });
    }

    if (responsibleUserId) {
      const responsible = await prisma.user.findFirst({
        where: { id: responsibleUserId },
      });
      if (!responsible) {
        return res
          .status(400)
          .json({ message: "Responsible user not found." });
      }
    }

    const taskResult = await validateTask(taskId, projectResult.projectId);
    if ("error" in taskResult) {
      return res.status(taskResult.status).json({ message: taskResult.error });
    }

    const actionItem = await prisma.onboardingActionItem.create({
      data: {
        onboardingProjectId: projectResult.projectId,
        taskId: taskResult.taskId,
        note: trimmedNote,
        responsibleUserId: responsibleUserId || null,
        status: nextStatus,
        loggedByUserId: req.user.sub,
      },
      include: actionItemInclude,
    });

    return res.status(201).json({
      message: "Action item created successfully.",
      actionItem: serializeActionItem(actionItem),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create action item.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateActionItem(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { taskId, note, responsibleUserId, status } =
      req.body as ActionItemBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Action item id is required." });
    }

    const existing = await prisma.onboardingActionItem.findFirst({
      where: { id },
    });
    if (!existing) {
      return res.status(404).json({ message: "Action item not found." });
    }

    const updateData: Prisma.OnboardingActionItemUncheckedUpdateInput = {};

    if (taskId !== undefined) {
      const taskResult = await validateTask(
        taskId,
        existing.onboardingProjectId,
      );
      if ("error" in taskResult) {
        return res
          .status(taskResult.status)
          .json({ message: taskResult.error });
      }
      updateData.taskId = taskResult.taskId;
    }

    if (note !== undefined) {
      const trimmedNote = note.trim();
      if (!trimmedNote) {
        return res.status(400).json({ message: "Note is required." });
      }
      updateData.note = trimmedNote;
    }

    if (status !== undefined) {
      if (!isActionStatus(status)) {
        return res.status(400).json({
          message: "Invalid action item status.",
          allowedStatuses: Object.values(OnboardingActionItemStatus),
        });
      }
      updateData.status = status;
    }

    if (responsibleUserId !== undefined) {
      if (responsibleUserId) {
        const responsible = await prisma.user.findFirst({
          where: { id: responsibleUserId },
        });
        if (!responsible) {
          return res
            .status(400)
            .json({ message: "Responsible user not found." });
        }
      }
      updateData.responsibleUserId = responsibleUserId || null;
    }

    const actionItem = await prisma.onboardingActionItem.update({
      where: { id },
      data: updateData,
      include: actionItemInclude,
    });

    return res.status(200).json({
      message: "Action item updated successfully.",
      actionItem: serializeActionItem(actionItem),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update action item.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteActionItem(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Action item id is required." });
    }

    const existing = await prisma.onboardingActionItem.findFirst({
      where: { id },
    });
    if (!existing) {
      return res.status(404).json({ message: "Action item not found." });
    }

    await prisma.onboardingActionItem.delete({ where: { id } });

    return res.status(200).json({
      message: "Action item deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete action item.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
