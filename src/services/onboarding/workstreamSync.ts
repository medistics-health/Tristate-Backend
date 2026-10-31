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

function mapTemplateTasksToCreate(templateTasks: any[]) {
  const now = new Date();
  return templateTasks.map((item, index) => {
    const startOffset = item.startOffsetDays ?? 0;
    const dueOffset = item.dueOffsetDays ?? 7;

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
      taskNumber: item.taskNumber ?? index + 1,
      name: item.taskName,
      phase: item.phase,
      ownerUserId: item.defaultOwnerId || null,
      startDate,
      dueDate,
      deliverable: item.deliverable || null,
      notes: item.notes || null,
    };
  });
}

const SERVICE_LINE_PHASE_NAMES: Record<string, Record<string, string>> = {
  RCM: {
    ONBOARDING_ACCESS: "Phase 1: Onboarding & Access",
    ASSESSMENT_DISCOVERY: "Phase 2: Assessment & Discovery",
    PLANNING_CONFIGURATION: "Phase 3: Planning & Configuration",
    TESTING_VALIDATION: "Phase 4: Testing & Validation",
    GO_LIVE_STABILIZATION: "Phase 5: Go-Live & Stabilization",
  },
  CCM: {
    ONBOARDING_ACCESS: "Phase 1: Onboarding & Access",
    ASSESSMENT_DISCOVERY: "Phase 2: Assessment & Discovery",
    PLANNING_CONFIGURATION: "Phase 3: Workflow Design & Configuration",
    TESTING_VALIDATION: "Phase 4: Enrollment Readiness",
    GO_LIVE_STABILIZATION: "Phase 5: Go-Live",
    HYPERCARE_OPTIMIZATION: "Phase 6: Hypercare & Optimization",
  },
  CREDENTIALING: {
    ONBOARDING_ACCESS: "Phase 1: Provider Intake",
    ASSESSMENT_DISCOVERY: "Phase 2: Credentialing Setup",
    PLANNING_CONFIGURATION: "Phase 3: Verification & Compliance",
    TESTING_VALIDATION: "Phase 4: Payer Enrollment",
    GO_LIVE_STABILIZATION: "Phase 5: TIN / NPI Validation",
    HYPERCARE_OPTIMIZATION: "Phase 6: Revenue Cycle Readiness",
    PROVIDER_ACTIVATION: "Phase 7: Provider Activation",
  },
  HR: {
    ONBOARDING_ACCESS: "Phase 1: Pre-Hire",
    ASSESSMENT_DISCOVERY: "Phase 2: New Hire Setup",
    PLANNING_CONFIGURATION: "Phase 3: Benefits",
    TESTING_VALIDATION: "Phase 4: Compliance",
    GO_LIVE_STABILIZATION: "Phase 5: Go-Live",
    HYPERCARE_OPTIMIZATION: "Phase 6: Stabilization",
  },
  MSP_IT: {
    ONBOARDING_ACCESS: "Phase 1: Discovery",
    ASSESSMENT_DISCOVERY: "Phase 2: Design",
    PLANNING_CONFIGURATION: "Phase 3: Deployment",
    TESTING_VALIDATION: "Phase 4: Testing",
    GO_LIVE_STABILIZATION: "Phase 5: Training",
    HYPERCARE_OPTIMIZATION: "Phase 6: Go-Live / Hypercare",
  },
};

const DEFAULT_PHASE_NAMES: Record<string, string> = {
  ONBOARDING_ACCESS: "Phase 1: Onboarding & Access",
  ASSESSMENT_DISCOVERY: "Phase 2: Assessment & Discovery",
  PLANNING_CONFIGURATION: "Phase 3: System Setup & Integration",
  TESTING_VALIDATION: "Phase 4: Testing & Validation",
  GO_LIVE_STABILIZATION: "Phase 5: Go-Live & Stabilization",
  HYPERCARE_OPTIMIZATION: "Phase 6: Hypercare & Optimization",
  PROVIDER_ACTIVATION: "Phase 7: Provider Activation",
};

const ALL_MILESTONES = [
  { phase: "ONBOARDING_ACCESS", code: "M1", week: "Week 1" },
  { phase: "ASSESSMENT_DISCOVERY", code: "M2", week: "Week 2" },
  { phase: "PLANNING_CONFIGURATION", code: "M3", week: "Week 3" },
  { phase: "TESTING_VALIDATION", code: "M4", week: "Week 4" },
  { phase: "GO_LIVE_STABILIZATION", code: "M5", week: "Week 5-6" },
  { phase: "HYPERCARE_OPTIMIZATION", code: "M6", week: "Week 7-8" },
  { phase: "PROVIDER_ACTIVATION", code: "M7", week: "Week 9-10" },
];

function getPhaseTitle(serviceLine: string, phase: string): string {
  if (SERVICE_LINE_PHASE_NAMES[serviceLine]?.[phase]) {
    return SERVICE_LINE_PHASE_NAMES[serviceLine][phase];
  }
  if (DEFAULT_PHASE_NAMES[phase]) {
    return DEFAULT_PHASE_NAMES[phase];
  }
  return `Phase: ${phase}`;
}

function buildMilestonesForTemplateTasks(serviceLine: string, tasks: any[]) {
  const activePhases = new Set((tasks || []).map((t) => t.phase).filter(Boolean));
  if (activePhases.size === 0) {
    return [];
  }

  // Filter ONLY the phases that actually exist in the template tasks
  const matchedMilestones = ALL_MILESTONES.filter((m) => activePhases.has(m.phase as any));

  return matchedMilestones.map((m, idx) => {
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timeStamp = String(now.getTime()).slice(-4);
    const codeSuffix = `${dateStamp}-${timeStamp}${idx + 1}`;
    const phaseTitle = getPhaseTitle(serviceLine, m.phase);
    return {
      milestoneCode: `${m.code}-${codeSuffix}`,
      description: `${phaseTitle} Completed`,
      targetWeek: m.week,
      status: "NOT_STARTED" as const,
    };
  });
}

export async function ensureWorkstreamsForPractice(
  practiceId: string,
  serviceLines: OnboardingServiceLine[],
  blueprintIds?: string[],
) {
  const ensured = await ensureProjectForPractice(practiceId);
  if ("error" in ensured) {
    throw new Error(ensured.error);
  }
  const projectId = ensured.project.id;

  // 1. Fetch blueprints if blueprintIds provided
  let templatesToApply: Array<{
    id: string;
    name: string;
    serviceLine: OnboardingServiceLine;
    tasks: any[];
  }> = [];

  if (Array.isArray(blueprintIds) && blueprintIds.length > 0) {
    templatesToApply = await prisma.onboardingTaskTemplate.findMany({
      where: {
        id: { in: blueprintIds },
        isActive: true,
      },
      include: {
        tasks: { orderBy: { taskNumber: "asc" } },
      },
    });
  }

  const createdWorkstreams = [];

  // If specific blueprints were selected, create a SEPARATE workstream for EACH selected blueprint!
  if (templatesToApply.length > 0) {
    for (const tpl of templatesToApply) {
      const milestonesToCreate = buildMilestonesForTemplateTasks(tpl.serviceLine, tpl.tasks || []);

      const created = await prisma.onboardingWorkstream.create({
        data: {
          onboardingProjectId: projectId,
          serviceLine: tpl.serviceLine,
          notes: tpl.name ? `Blueprint: ${tpl.name}` : null,
          status: OnboardingWorkstreamStatus.PENDING,
          ...(milestonesToCreate.length > 0
            ? {
                milestones: {
                  create: milestonesToCreate,
                },
              }
            : {}),
          ...(tpl.tasks?.length
            ? {
                tasks: {
                  create: mapTemplateTasksToCreate(tpl.tasks).map((t, idx) => ({
                    ...t,
                    taskNumber: idx + 1,
                  })),
                },
              }
            : {}),
        },
      });
      createdWorkstreams.push(created);
    }
  }

  // Also handle any service lines passed directly that did not come from blueprints
  const linesHandled = new Set(templatesToApply.map((t) => t.serviceLine));
  const remainingLines = serviceLines.filter((l) => !linesHandled.has(l));

  for (const serviceLine of remainingLines) {
    const defaultTemplate = await prisma.onboardingTaskTemplate.findFirst({
      where: { serviceLine, isActive: true },
      include: { tasks: { orderBy: { taskNumber: "asc" } } },
    });

    const milestonesToCreate = buildMilestonesForTemplateTasks(
      serviceLine,
      defaultTemplate?.tasks || [],
    );

    const created = await prisma.onboardingWorkstream.create({
      data: {
        onboardingProjectId: projectId,
        serviceLine,
        notes: defaultTemplate?.name ? `Blueprint: ${defaultTemplate.name}` : null,
        status: OnboardingWorkstreamStatus.PENDING,
        ...(milestonesToCreate.length > 0
          ? {
              milestones: {
                create: milestonesToCreate,
              },
            }
          : {}),
        ...(defaultTemplate?.tasks?.length
          ? {
              tasks: {
                create: mapTemplateTasksToCreate(defaultTemplate.tasks).map((t, idx) => ({
                  ...t,
                  taskNumber: idx + 1,
                })),
              },
            }
          : {}),
      },
    });
    createdWorkstreams.push(created);
  }

  return createdWorkstreams;
}
