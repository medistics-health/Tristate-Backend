import {
  OnboardingServiceLine,
  OnboardingWorkstreamStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

export async function ensureProjectForPractice(practiceId: string) {
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

async function createWorkstreamForProject(
  onboardingProjectId: string,
  serviceLine: OnboardingServiceLine,
) {
  const template = await prisma.onboardingTaskTemplate.findFirst({
    where: { serviceLine, isActive: true },
    include: {
      tasks: { orderBy: { taskNumber: "asc" } },
    },
  });

  return prisma.onboardingWorkstream.create({
    data: {
      onboardingProjectId,
      serviceLine,
      status: OnboardingWorkstreamStatus.PENDING,
      ...(template?.tasks.length
        ? {
            tasks: {
              create: template.tasks.map((item) => {
                const now = new Date();
                const startOffset = item.startOffsetDays ?? 0;
                const dueOffset = item.dueOffsetDays ?? 7;

                return {
                  taskNumber: item.taskNumber,
                  name: item.taskName,
                  phase: item.phase,
                  ownerUserId: item.defaultOwnerId,
                  startDate: new Date(now.getTime() + startOffset * 86400000),
                  dueDate: new Date(now.getTime() + dueOffset * 86400000),
                  deliverable: item.deliverable,
                  notes: item.notes,
                };
              }),
            },
          }
        : {}),
    },
  });
}

export async function ensureWorkstreamsForPractice(
  practiceId: string,
  serviceLines: OnboardingServiceLine[],
) {
  const uniqueLines = [...new Set(serviceLines)];
  if (uniqueLines.length === 0) {
    return [];
  }

  const ensured = await ensureProjectForPractice(practiceId);
  if ("error" in ensured) {
    throw new Error(ensured.error);
  }

  const existing = await prisma.onboardingWorkstream.findMany({
    where: {
      onboardingProjectId: ensured.project.id,
      serviceLine: { in: uniqueLines },
    },
    select: { serviceLine: true },
  });
  const existingLines = new Set(existing.map((item) => item.serviceLine));
  const created = [];

  for (const serviceLine of uniqueLines) {
    if (existingLines.has(serviceLine)) {
      continue;
    }
    created.push(
      await createWorkstreamForProject(ensured.project.id, serviceLine),
    );
  }

  return created;
}
