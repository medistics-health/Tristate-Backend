import {
  OnboardingServiceLine,
  OnboardingWorkstreamStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

export async function ensureProjectForPractice(
  practiceId: string,
  extras?: { goLiveTarget?: Date | null },
) {
  const practice = await prisma.practice.findFirst({
    where: { id: practiceId },
  });
  if (!practice) {
    return { error: "Practice not found." as const, status: 404 as number };
  }

  const existing = await prisma.onboardingProject.findFirst({
    where: { practiceId },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    if (extras && "goLiveTarget" in extras) {
      const updated = await prisma.onboardingProject.update({
        where: { id: existing.id },
        data: { goLiveTarget: extras.goLiveTarget ?? null },
      });
      return { project: updated };
    }
    return { project: existing };
  }

  const created = await prisma.onboardingProject.create({
    data: {
      practiceId,
      ...(extras && "goLiveTarget" in extras
        ? { goLiveTarget: extras.goLiveTarget ?? null }
        : {}),
    },
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

  const DEFAULT_MILESTONES = [
    { code: "M1", week: "Week 1", desc: "Phase 1: Onboarding & Access Completed" },
    { code: "M2", week: "Week 2", desc: "Phase 2: Assessment & Discovery Completed" },
    { code: "M3", week: "Week 3", desc: "Phase 3: System Setup & Integration Completed" },
    { code: "M4", week: "Week 4", desc: "Phase 4: Training & Enablement Completed" },
    { code: "M5", week: "Week 5-6", desc: "Phase 5: Go-Live & Stabilization Completed" },
  ];

  return prisma.onboardingWorkstream.create({
    data: {
      onboardingProjectId,
      serviceLine,
      status: OnboardingWorkstreamStatus.PENDING,
      milestones: {
        create: DEFAULT_MILESTONES.map((m) => ({
          milestoneCode: m.code,
          description: m.desc,
          targetWeek: m.week,
          status: "NOT_STARTED",
        })),
      },
      ...(template?.tasks.length
        ? {
            tasks: {
              create: template.tasks.map((item) => {
                const now = new Date();
                const startOffset = item.startOffsetDays ?? 0;
                const dueOffset = item.dueOffsetDays ?? 7;

                // 1. Calculate Start Date
                let startDate: Date | null = null;
                if (item.startMode === "FIXED_DATE" || item.fixedStartDate) {
                  if (item.fixedStartDate) {
                    const parsedStart = new Date(item.fixedStartDate);
                    if (!isNaN(parsedStart.getTime())) startDate = parsedStart;
                  }
                }
                if (!startDate) {
                  startDate = new Date(now.getTime() + startOffset * 86400000);
                }

                // 2. Calculate Due Date
                let dueDate: Date | null = null;
                if (item.dueMode === "FIXED_DATE" || item.fixedDueDate) {
                  if (item.fixedDueDate) {
                    const parsedDue = new Date(item.fixedDueDate);
                    if (!isNaN(parsedDue.getTime())) dueDate = parsedDue;
                  }
                }
                if (!dueDate) {
                  dueDate = new Date(now.getTime() + dueOffset * 86400000);
                }

                return {
                  taskNumber: item.taskNumber,
                  name: item.taskName,
                  phase: item.phase,
                  ownerUserId: item.defaultOwnerId,
                  startDate,
                  dueDate,
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
