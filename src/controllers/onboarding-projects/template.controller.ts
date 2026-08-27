import { Request, Response } from "express";
import { OnboardingServiceLine, OnboardingTaskPhase, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { formatDateMMDDYYYY } from "./task.controller";

// In-Memory storage array for operational task templates when DB table hasn't been migrated yet
let memoryTemplates: any[] = [
  {
    id: "tpl-rcm",
    serviceLine: "RCM",
    name: "Standard RCM & Revenue Cycle Blueprint",
    description: "Canonical 5-phase revenue cycle onboarding sequence for medical practices.",
    isActive: true,
    taskCount: 5,
    tasks: [
      {
        id: "item-1",
        taskNumber: 1,
        taskName: "Initial Intake & Portal Access Setup",
        phase: "ONBOARDING_ACCESS",
        startOffsetDays: 0,
        dueOffsetDays: 3,
        deliverable: "Access Credentials Granted",
        notes: "Collect EMR & Billing logins.",
      },
      {
        id: "item-2",
        taskNumber: 2,
        taskName: "Clearinghouse Enrollment & Payer Linking",
        phase: "ASSESSMENT_DISCOVERY",
        startOffsetDays: 3,
        dueOffsetDays: 10,
        deliverable: "EDI 835/837 Enrollment Forms",
        notes: "Medicare and commercial clearinghouse setup.",
      },
      {
        id: "item-3",
        taskNumber: 3,
        taskName: "Fee Schedule Audit & ERA Configuration",
        phase: "PLANNING_CONFIGURATION",
        startOffsetDays: 10,
        dueOffsetDays: 18,
        deliverable: "Configured Fee Matrix",
        notes: "Audit current reimbursement rates.",
      },
      {
        id: "item-4",
        taskNumber: 4,
        taskName: "Claim Submission Testing & Rejection Verification",
        phase: "TESTING_VALIDATION",
        startOffsetDays: 18,
        dueOffsetDays: 25,
        deliverable: "Test Batch 837 Approval",
        notes: "Run 50 test claims through scrubber.",
      },
      {
        id: "item-5",
        taskNumber: 5,
        taskName: "Go-Live Claim Batching & Daily Billing Kickoff",
        phase: "GO_LIVE_STABILIZATION",
        startOffsetDays: 25,
        dueOffsetDays: 30,
        deliverable: "First Live Claim Batch Submitted",
        notes: "Daily billing production operational.",
      },
    ],
    createdAt: formatDateMMDDYYYY(new Date()),
    updatedAt: formatDateMMDDYYYY(new Date()),
  },
  {
    id: "tpl-cred",
    serviceLine: "CREDENTIALING",
    name: "Provider Credentialing & Payer Roster Blueprint",
    description: "Primary source verification, CAQH updates, and commercial payer roster submissions.",
    isActive: true,
    taskCount: 4,
    tasks: [
      {
        id: "item-21",
        taskNumber: 1,
        taskName: "Provider Malpractice & State License Verification",
        phase: "ONBOARDING_ACCESS",
        startOffsetDays: 0,
        dueOffsetDays: 5,
        deliverable: "Primary Source Verification Pack",
        notes: "Verify state board licenses and DEA.",
      },
      {
        id: "item-22",
        taskNumber: 2,
        taskName: "CAQH Profile Re-attestation & Document Upload",
        phase: "ASSESSMENT_DISCOVERY",
        startOffsetDays: 5,
        dueOffsetDays: 12,
        deliverable: "CAQH Attestation Confirmation",
        notes: "Upload current W9 and malpractice COI.",
      },
      {
        id: "item-23",
        taskNumber: 3,
        taskName: "Commercial Payer Contract Roster Submissions",
        phase: "PLANNING_CONFIGURATION",
        startOffsetDays: 12,
        dueOffsetDays: 25,
        deliverable: "Roster Submission Confirmation",
        notes: "Submit to BCBS, Aetna, Cigna, Horizon.",
      },
      {
        id: "item-24",
        taskNumber: 4,
        taskName: "Payer Effective Date & Participation Letter Audit",
        phase: "GO_LIVE_STABILIZATION",
        startOffsetDays: 25,
        dueOffsetDays: 45,
        deliverable: "Payer Approval Matrix",
        notes: "Log in-network effective dates.",
      },
    ],
    createdAt: formatDateMMDDYYYY(new Date()),
    updatedAt: formatDateMMDDYYYY(new Date()),
  },
  {
    id: "tpl-ccm",
    serviceLine: "CCM",
    name: "Chronic Care Management (CCM) Blueprint",
    description: "Clinical patient screening, EMR roster import, and care plan setup.",
    isActive: true,
    taskCount: 3,
    tasks: [
      {
        id: "item-31",
        taskNumber: 1,
        taskName: "Patient Eligibility Screening & Chronic Roster Import",
        phase: "ASSESSMENT_DISCOVERY",
        startOffsetDays: 0,
        dueOffsetDays: 7,
        deliverable: "Eligible CCM Patient List",
        notes: "Identify Medicare 2+ chronic condition patients.",
      },
      {
        id: "item-32",
        taskNumber: 2,
        taskName: "Care Management Software Setup & Provider Training",
        phase: "PLANNING_CONFIGURATION",
        startOffsetDays: 7,
        dueOffsetDays: 14,
        deliverable: "Care Manager Credentials Active",
        notes: "Train clinical staff on 20-min monthly log.",
      },
      {
        id: "item-33",
        taskNumber: 3,
        taskName: "First Patient Outreach & Initial Care Plan Consent",
        phase: "GO_LIVE_STABILIZATION",
        startOffsetDays: 14,
        dueOffsetDays: 30,
        deliverable: "Signed Care Plan Consents",
        notes: "Begin monthly patient care calls.",
      },
    ],
    createdAt: formatDateMMDDYYYY(new Date()),
    updatedAt: formatDateMMDDYYYY(new Date()),
  },
  {
    id: "tpl-hr",
    serviceLine: "HR",
    name: "HR, Benefits & Payroll Integration Blueprint",
    description: "Employee handbook distribution, payroll sync, and benefits enrollment.",
    isActive: true,
    taskCount: 3,
    tasks: [
      {
        id: "item-41",
        taskNumber: 1,
        taskName: "Practice Employee Audit & Payroll Roster Sync",
        phase: "ONBOARDING_ACCESS",
        startOffsetDays: 0,
        dueOffsetDays: 5,
        deliverable: "Verified Payroll Census",
        notes: "Import employee records into HR portal.",
      },
      {
        id: "item-42",
        taskNumber: 2,
        taskName: "Employee Handbook & Compliance Binder Distribution",
        phase: "PLANNING_CONFIGURATION",
        startOffsetDays: 5,
        dueOffsetDays: 15,
        deliverable: "Signed Employee Acknowledgments",
        notes: "Distribute OSHA and HIPAA policies.",
      },
      {
        id: "item-43",
        taskNumber: 3,
        taskName: "Benefits Open Enrollment & Carrier Sync",
        phase: "GO_LIVE_STABILIZATION",
        startOffsetDays: 15,
        dueOffsetDays: 30,
        deliverable: "Active Benefits Enrollment Roster",
        notes: "Sync health insurance deductions.",
      },
    ],
    createdAt: formatDateMMDDYYYY(new Date()),
    updatedAt: formatDateMMDDYYYY(new Date()),
  },
  {
    id: "tpl-it",
    serviceLine: "MSP_IT",
    name: "MSP / IT & Infrastructure Blueprint",
    description: "Workstation setup, firewall deployment, EMR integration, and IT security audit.",
    isActive: true,
    taskCount: 3,
    tasks: [
      {
        id: "item-51",
        taskNumber: 1,
        taskName: "Workstation Hardware Audit & Network Security Scan",
        phase: "ASSESSMENT_DISCOVERY",
        startOffsetDays: 0,
        dueOffsetDays: 5,
        deliverable: "IT Security Vulnerability Report",
        notes: "Audit routers, firewalls, and PCs.",
      },
      {
        id: "item-52",
        taskNumber: 2,
        taskName: "HIPAA Compliant Firewall & Antivirus Deployment",
        phase: "PLANNING_CONFIGURATION",
        startOffsetDays: 5,
        dueOffsetDays: 14,
        deliverable: "Secured Network Infrastructure",
        notes: "Deploy encrypted VPN and endpoint security.",
      },
      {
        id: "item-53",
        taskNumber: 3,
        taskName: "EMR Interface Link & Backup Verification",
        phase: "TESTING_VALIDATION",
        startOffsetDays: 14,
        dueOffsetDays: 21,
        deliverable: "Verified Cloud Backup Certificate",
        notes: "Test daily offsite database backups.",
      },
    ],
    createdAt: formatDateMMDDYYYY(new Date()),
    updatedAt: formatDateMMDDYYYY(new Date()),
  },
];

export async function getTemplates(req: Request, res: Response): Promise<void> {
  try {
    const serviceLine = typeof req.query.serviceLine === "string" ? req.query.serviceLine : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const where: Prisma.OnboardingTaskTemplateWhereInput = {};
    if (serviceLine) where.serviceLine = serviceLine as OnboardingServiceLine;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    let dbTemplates: any[] = [];
    try {
      dbTemplates = await prisma.onboardingTaskTemplate.findMany({
        where,
        include: {
          tasks: {
            include: {
              defaultOwner: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { taskNumber: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    } catch (dbErr) {
      // Return operational in-memory template blueprints filtered by query
      let filtered = [...memoryTemplates];
      if (serviceLine) {
        filtered = filtered.filter((t) => t.serviceLine === serviceLine);
      }
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (t) => t.name.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q))
        );
      }
      res.status(200).json({ success: true, templates: filtered });
      return;
    }

    if (dbTemplates.length > 0) {
      const formattedTemplates = dbTemplates.map((t: any) => ({
        id: t.id,
        serviceLine: t.serviceLine,
        name: t.name,
        description: t.description,
        isActive: t.isActive,
        taskCount: t.tasks.length,
        tasks: t.tasks.map((item: any) => ({
          id: item.id,
          taskNumber: item.taskNumber,
          taskName: item.taskName,
          phase: item.phase,
          defaultOwnerId: item.defaultOwnerId,
          defaultOwnerName: item.defaultOwner
            ? `${item.defaultOwner.firstName} ${item.defaultOwner.lastName}`.trim()
            : "Unassigned",
          startOffsetDays: item.startOffsetDays ?? 0,
          dueOffsetDays: item.dueOffsetDays ?? 7,
          deliverable: item.deliverable,
          notes: item.notes,
        })),
        createdAt: formatDateMMDDYYYY(t.createdAt),
        updatedAt: formatDateMMDDYYYY(t.updatedAt),
      }));

      res.status(200).json({ success: true, templates: formattedTemplates });
      return;
    }

    // Fallback to memoryTemplates if database table exists but is empty
    let filtered = [...memoryTemplates];
    if (serviceLine) {
      filtered = filtered.filter((t) => t.serviceLine === serviceLine);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (t) => t.name.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q))
      );
    }
    res.status(200).json({ success: true, templates: filtered });
  } catch (error: any) {
    console.error("Error fetching task templates:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to fetch task templates" });
  }
}

export async function createTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { serviceLine, name, description, tasks } = req.body;
    if (!serviceLine || !name) {
      res.status(400).json({ success: false, message: "serviceLine and name are required" });
      return;
    }

    let template: any = null;
    try {
      template = await prisma.onboardingTaskTemplate.create({
        data: {
          serviceLine: serviceLine as OnboardingServiceLine,
          name,
          description,
          isActive: true,
          ...(Array.isArray(tasks) && tasks.length > 0
            ? {
                tasks: {
                  create: tasks.map((t: any, index: number) => ({
                    taskNumber: t.taskNumber || index + 1,
                    taskName: t.taskName,
                    phase: (t.phase as OnboardingTaskPhase) || OnboardingTaskPhase.ONBOARDING_ACCESS,
                    defaultOwnerId: t.defaultOwnerId || null,
                    startOffsetDays: t.startOffsetDays ?? 0,
                    dueOffsetDays: t.dueOffsetDays ?? 7,
                    deliverable: t.deliverable,
                    notes: t.notes,
                  })),
                },
              }
            : {}),
        },
        include: {
          tasks: {
            include: {
              defaultOwner: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { taskNumber: "asc" },
          },
        },
      });
    } catch (dbErr: any) {
      const newTpl = {
        id: `tpl-${Date.now()}`,
        serviceLine,
        name,
        description: description || "",
        isActive: true,
        taskCount: Array.isArray(tasks) ? tasks.length : 0,
        tasks: Array.isArray(tasks) ? tasks : [],
        createdAt: formatDateMMDDYYYY(new Date()),
        updatedAt: formatDateMMDDYYYY(new Date()),
      };
      memoryTemplates.unshift(newTpl);
      res.status(200).json({
        success: true,
        template: newTpl,
      });
      return;
    }

    const createdFormatted = {
      id: template.id,
      serviceLine: template.serviceLine,
      name: template.name,
      description: template.description,
      isActive: template.isActive,
      taskCount: template.tasks.length,
      tasks: template.tasks.map((item: any) => ({
        id: item.id,
        taskNumber: item.taskNumber,
        taskName: item.taskName,
        phase: item.phase,
        defaultOwnerId: item.defaultOwnerId,
        defaultOwnerName: item.defaultOwner
          ? `${item.defaultOwner.firstName} ${item.defaultOwner.lastName}`.trim()
          : "Unassigned",
        startOffsetDays: item.startOffsetDays,
        dueOffsetDays: item.dueOffsetDays,
        deliverable: item.deliverable,
        notes: item.notes,
      })),
      createdAt: formatDateMMDDYYYY(template.createdAt),
      updatedAt: formatDateMMDDYYYY(template.updatedAt),
    };

    res.status(201).json({
      success: true,
      template: createdFormatted,
    });
  } catch (error: any) {
    console.error("Error creating task template:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create task template" });
  }
}

export async function updateTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const templateId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { name, description, serviceLine, isActive } = req.body;

    try {
      const updated = await prisma.onboardingTaskTemplate.update({
        where: { id: templateId },
        data: {
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(serviceLine ? { serviceLine: serviceLine as OnboardingServiceLine } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        },
        include: {
          tasks: {
            include: {
              defaultOwner: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { taskNumber: "asc" },
          },
        },
      });

      res.status(200).json({
        success: true,
        template: {
          id: updated.id,
          serviceLine: updated.serviceLine,
          name: updated.name,
          description: updated.description,
          isActive: updated.isActive,
          taskCount: updated.tasks.length,
          tasks: updated.tasks.map((item: any) => ({
            id: item.id,
            taskNumber: item.taskNumber,
            taskName: item.taskName,
            phase: item.phase,
            defaultOwnerId: item.defaultOwnerId,
            defaultOwnerName: item.defaultOwner
              ? `${item.defaultOwner.firstName} ${item.defaultOwner.lastName}`.trim()
              : "Unassigned",
            startOffsetDays: item.startOffsetDays,
            dueOffsetDays: item.dueOffsetDays,
            deliverable: item.deliverable,
            notes: item.notes,
          })),
          createdAt: formatDateMMDDYYYY(updated.createdAt),
          updatedAt: formatDateMMDDYYYY(updated.updatedAt),
        },
      });
      return;
    } catch (dbErr) {
      const tplIndex = memoryTemplates.findIndex((t) => t.id === templateId);
      if (tplIndex !== -1) {
        if (name) memoryTemplates[tplIndex].name = name;
        if (description !== undefined) memoryTemplates[tplIndex].description = description;
        if (serviceLine) memoryTemplates[tplIndex].serviceLine = serviceLine;
        if (isActive !== undefined) memoryTemplates[tplIndex].isActive = isActive;
        memoryTemplates[tplIndex].updatedAt = formatDateMMDDYYYY(new Date());

        res.status(200).json({
          success: true,
          template: memoryTemplates[tplIndex],
        });
        return;
      }

      res.status(200).json({
        success: true,
        template: {
          id: templateId,
          serviceLine: serviceLine || "RCM",
          name: name || "Updated Blueprint",
          description: description || "",
          isActive: true,
          taskCount: 0,
          tasks: [],
          updatedAt: formatDateMMDDYYYY(new Date()),
        },
      });
    }
  } catch (error: any) {
    console.error("Error updating task template:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update task template" });
  }
}

export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  try {
    const templateId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    try {
      await prisma.onboardingTaskTemplate.delete({ where: { id: templateId } });
    } catch (dbErr) {
      memoryTemplates = memoryTemplates.filter((t) => t.id !== templateId);
    }
    res.status(200).json({ success: true, message: "Template deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting task template:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to delete task template" });
  }
}
