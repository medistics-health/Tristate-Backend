import {
  OnboardingServiceLine,
  OnboardingTaskStatus,
  OnboardingWorkstreamStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type WorkstreamBody = {
  practiceId?: string;
  onboardingProjectId?: string;
  serviceLine?: string;
  status?: string;
  ownerUserId?: string | null;
  targetDate?: string | null;
  notes?: string | null;
};

const workstreamInclude = {
  onboardingProject: {
    include: {
      practice: {
        select: { id: true, name: true },
      },
    },
  },
  owner: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  tasks: {
    select: {
      id: true,
      taskNumber: true,
      name: true,
      status: true,
      dueDate: true,
    },
    orderBy: { taskNumber: "asc" as const },
  },
  milestones: {
    select: {
      id: true,
      milestoneCode: true,
      description: true,
      status: true,
      targetDate: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
  _count: {
    select: { tasks: true, milestones: true },
  },
} satisfies Prisma.OnboardingWorkstreamInclude;

function isServiceLine(value: string): value is OnboardingServiceLine {
  return Object.values(OnboardingServiceLine).includes(
    value as OnboardingServiceLine,
  );
}

function isWorkstreamStatus(
  value: string,
): value is OnboardingWorkstreamStatus {
  return Object.values(OnboardingWorkstreamStatus).includes(
    value as OnboardingWorkstreamStatus,
  );
}

function parseOptionalDate(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "Invalid targetDate." as const };
  }
  return { value: parsed };
}

function serializeWorkstream(
  workstream: Prisma.OnboardingWorkstreamGetPayload<{
    include: typeof workstreamInclude;
  }>,
) {
  const totalTasks = workstream.tasks.length;
  const completedTasks = workstream.tasks.filter(
    (task) => task.status === OnboardingTaskStatus.COMPLETE,
  ).length;
  const percentComplete =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  return {
    ...workstream,
    practiceId: workstream.onboardingProject.practice.id,
    practice: workstream.onboardingProject.practice,
    completedTasks,
    totalTasks,
    percentComplete,
  };
}

async function ensureProjectForPractice(practiceId: string) {
  const practice = await prisma.practice.findFirst({
    where: { id: practiceId },
  });
  if (!practice) {
    return { error: "Practice not found." as const, status: 404 };
  }

  const existing = await prisma.onboardingProject.findFirst({
    where: { practiceId },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return { project: existing };
  }

  const created = await prisma.onboardingProject.create({
    data: { practiceId },
  });
  return { project: created };
}

export async function getWorkstreams(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 1000;
    const search = (req.query.search as string) || "";
    const practiceId = req.query.practiceId as string | undefined;
    const serviceLine = req.query.serviceLine as string | undefined;
    const status = req.query.status as string | undefined;
    const ownerUserId = req.query.ownerUserId as string | undefined;
    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";
    const skip = (page - 1) * limit;

    if (serviceLine && !isServiceLine(serviceLine)) {
      return res.status(400).json({
        message: "Invalid service line.",
        allowedServiceLines: Object.values(OnboardingServiceLine),
      });
    }

    if (status && !isWorkstreamStatus(status)) {
      return res.status(400).json({
        message: "Invalid workstream status.",
        allowedStatuses: Object.values(OnboardingWorkstreamStatus),
      });
    }

    const where: Prisma.OnboardingWorkstreamWhereInput = {};

    if (practiceId) {
      where.onboardingProject = { practiceId };
    }

    if (search) {
      where.onboardingProject = {
        ...(where.onboardingProject as object),
        practice: {
          name: { contains: search, mode: "insensitive" },
        },
      };
    }

    if (serviceLine) {
      where.serviceLine = serviceLine;
    }
    if (status) {
      where.status = status;
    }
    if (ownerUserId) {
      where.ownerUserId = ownerUserId;
    }

    const [workstreams, total] = await Promise.all([
      prisma.onboardingWorkstream.findMany({
        where,
        include: workstreamInclude,
        orderBy: { updatedAt: sortOrder },
        skip,
        take: limit,
      }),
      prisma.onboardingWorkstream.count({ where }),
    ]);

    return res.status(200).json({
      message: "Workstreams fetched successfully.",
      workstreams: workstreams.map(serializeWorkstream),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch workstreams.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getWorkstream(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Workstream id is required." });
    }

    const workstream = await prisma.onboardingWorkstream.findFirst({
      where: { id },
      include: workstreamInclude,
    });

    if (!workstream) {
      return res.status(404).json({ message: "Workstream not found." });
    }

    return res.status(200).json({
      message: "Workstream fetched successfully.",
      workstream: serializeWorkstream(workstream),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch workstream.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createWorkstream(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const {
      practiceId,
      onboardingProjectId,
      serviceLine,
      status,
      ownerUserId,
      targetDate,
      notes,
    } = req.body as WorkstreamBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!practiceId && !onboardingProjectId) {
      return res.status(400).json({
        message: "practiceId or onboardingProjectId is required.",
      });
    }

    if (!serviceLine || !isServiceLine(serviceLine)) {
      return res.status(400).json({
        message: "A valid serviceLine is required.",
        allowedServiceLines: Object.values(OnboardingServiceLine),
      });
    }

    const nextStatus = status || OnboardingWorkstreamStatus.PENDING;
    if (!isWorkstreamStatus(nextStatus)) {
      return res.status(400).json({
        message: "Invalid workstream status.",
        allowedStatuses: Object.values(OnboardingWorkstreamStatus),
      });
    }

    const parsedTargetDate = parseOptionalDate(targetDate);
    if (parsedTargetDate && "error" in parsedTargetDate) {
      return res.status(400).json({ message: parsedTargetDate.error });
    }

    if (ownerUserId) {
      const owner = await prisma.user.findFirst({ where: { id: ownerUserId } });
      if (!owner) {
        return res.status(400).json({ message: "Owner user not found." });
      }
    }

    let projectId = onboardingProjectId;
    if (!projectId && practiceId) {
      const ensured = await ensureProjectForPractice(practiceId);
      if ("error" in ensured) {
        return res.status(ensured.status).json({ message: ensured.error });
      }
      projectId = ensured.project.id;
    } else if (projectId) {
      const project = await prisma.onboardingProject.findFirst({
        where: { id: projectId },
      });
      if (!project) {
        return res.status(404).json({ message: "Onboarding project not found." });
      }
    }

    const existing = await prisma.onboardingWorkstream.findFirst({
      where: {
        onboardingProjectId: projectId!,
        serviceLine,
      },
    });
    if (existing) {
      return res.status(409).json({
        message:
          "A workstream already exists for this practice and service line.",
      });
    }

    const template = await prisma.onboardingTaskTemplate.findFirst({
      where: { serviceLine, isActive: true },
      include: {
        tasks: { orderBy: { taskNumber: "asc" } },
      },
    });

    const workstream = await prisma.onboardingWorkstream.create({
      data: {
        onboardingProjectId: projectId!,
        serviceLine,
        status: nextStatus,
        ownerUserId: ownerUserId || null,
        targetDate: parsedTargetDate?.value ?? null,
        notes: notes?.trim() || null,
        ...(template?.tasks.length
          ? {
              tasks: {
                create: template.tasks.map((item) => ({
                  taskNumber: item.taskNumber,
                  name: item.taskName,
                  phase: item.phase,
                  ownerUserId: item.defaultOwnerId,
                  deliverable: item.deliverable,
                  notes: item.notes,
                })),
              },
            }
          : {}),
      },
      include: workstreamInclude,
    });

    return res.status(201).json({
      message: "Workstream created successfully.",
      workstream: serializeWorkstream(workstream),
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(409).json({
        message:
          "A workstream already exists for this practice and service line.",
      });
    }

    return res.status(500).json({
      message: "Unable to create workstream.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateWorkstream(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { serviceLine, status, ownerUserId, targetDate, notes } =
      req.body as WorkstreamBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Workstream id is required." });
    }

    const existing = await prisma.onboardingWorkstream.findFirst({
      where: { id },
    });
    if (!existing) {
      return res.status(404).json({ message: "Workstream not found." });
    }

    const updateData: Prisma.OnboardingWorkstreamUncheckedUpdateInput = {};

    if (serviceLine !== undefined) {
      if (!isServiceLine(serviceLine)) {
        return res.status(400).json({
          message: "Invalid service line.",
          allowedServiceLines: Object.values(OnboardingServiceLine),
        });
      }
      updateData.serviceLine = serviceLine;
    }

    if (status !== undefined) {
      if (!isWorkstreamStatus(status)) {
        return res.status(400).json({
          message: "Invalid workstream status.",
          allowedStatuses: Object.values(OnboardingWorkstreamStatus),
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

    if (targetDate !== undefined) {
      const parsedTargetDate = parseOptionalDate(targetDate);
      if (parsedTargetDate && "error" in parsedTargetDate) {
        return res.status(400).json({ message: parsedTargetDate.error });
      }
      updateData.targetDate = parsedTargetDate?.value ?? null;
    }

    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null;
    }

    const workstream = await prisma.onboardingWorkstream.update({
      where: { id },
      data: updateData,
      include: workstreamInclude,
    });

    return res.status(200).json({
      message: "Workstream updated successfully.",
      workstream: serializeWorkstream(workstream),
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(409).json({
        message:
          "A workstream already exists for this practice and service line.",
      });
    }

    return res.status(500).json({
      message: "Unable to update workstream.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteWorkstream(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Workstream id is required." });
    }

    const existing = await prisma.onboardingWorkstream.findFirst({
      where: { id },
    });
    if (!existing) {
      return res.status(404).json({ message: "Workstream not found." });
    }

    await prisma.onboardingWorkstream.delete({ where: { id } });

    return res.status(200).json({
      message: "Workstream deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete workstream.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
