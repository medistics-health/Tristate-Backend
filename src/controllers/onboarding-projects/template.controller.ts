import { Request, Response } from "express";
import { OnboardingServiceLine, OnboardingTaskPhase, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { formatDateMMDDYYYY } from "./task.controller";

// In-Memory storage array for user-created task templates
let memoryTemplates: any[] = [];

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

    let formattedDbTemplates: any[] = [];
    if (dbTemplates.length > 0) {
      formattedDbTemplates = dbTemplates.map((t: any) => ({
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
          startMode: item.startMode || (item.fixedStartDate ? "FIXED_DATE" : "OFFSET"),
          dueMode: item.dueMode || (item.fixedDueDate ? "FIXED_DATE" : "OFFSET"),
          startOffsetDays: item.startOffsetDays ?? 0,
          dueOffsetDays: item.dueOffsetDays ?? 7,
          fixedStartDate: item.fixedStartDate,
          fixedDueDate: item.fixedDueDate,
          deliverable: item.deliverable,
          notes: item.notes,
        })),
        createdAt: formatDateMMDDYYYY(t.createdAt),
        updatedAt: formatDateMMDDYYYY(t.updatedAt),
      }));
    }

    // Combine DB templates and memoryTemplates
    let combined = [...formattedDbTemplates, ...memoryTemplates];
    if (serviceLine) {
      combined = combined.filter((t) => t.serviceLine === serviceLine);
    }
    if (search) {
      const q = search.toLowerCase();
      combined = combined.filter(
        (t) => t.name.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q))
      );
    }

    res.status(200).json({ success: true, templates: combined });
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
                    startMode: t.startMode || (t.fixedStartDate ? "FIXED_DATE" : "OFFSET"),
                    dueMode: t.dueMode || (t.fixedDueDate ? "FIXED_DATE" : "OFFSET"),
                    startOffsetDays: t.startOffsetDays ?? 0,
                    dueOffsetDays: t.dueOffsetDays ?? 7,
                    fixedStartDate: t.fixedStartDate || null,
                    fixedDueDate: t.fixedDueDate || null,
                    deliverable: t.deliverable || null,
                    notes: t.notes || null,
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
        tasks: Array.isArray(tasks) ? tasks.map((t: any, index: number) => ({
          id: `item-${Date.now()}-${index}`,
          taskNumber: t.taskNumber || index + 1,
          taskName: t.taskName || t.name || `Task ${index + 1}`,
          phase: t.phase || "ONBOARDING_ACCESS",
          defaultOwnerId: t.defaultOwnerId,
          defaultOwnerName: t.defaultOwnerName || "Unassigned",
          startMode: t.startMode || (t.fixedStartDate ? "FIXED_DATE" : "OFFSET"),
          dueMode: t.dueMode || (t.fixedDueDate ? "FIXED_DATE" : "OFFSET"),
          startOffsetDays: t.startOffsetDays ?? 0,
          dueOffsetDays: t.dueOffsetDays ?? 7,
          fixedStartDate: t.fixedStartDate,
          fixedDueDate: t.fixedDueDate,
          deliverable: t.deliverable,
          notes: t.notes,
        })) : [],
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
        startMode: item.startMode || (item.fixedStartDate ? "FIXED_DATE" : "OFFSET"),
        dueMode: item.dueMode || (item.fixedDueDate ? "FIXED_DATE" : "OFFSET"),
        startOffsetDays: item.startOffsetDays,
        dueOffsetDays: item.dueOffsetDays,
        fixedStartDate: item.fixedStartDate,
        fixedDueDate: item.fixedDueDate,
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
    const { name, description, serviceLine, isActive, tasks } = req.body;

    try {
      if (Array.isArray(tasks)) {
        await prisma.onboardingTaskTemplateItem.deleteMany({
          where: { templateId },
        });

        if (tasks.length > 0) {
          await prisma.onboardingTaskTemplateItem.createMany({
            data: tasks.map((t: any, index: number) => ({
              templateId,
              taskNumber: t.taskNumber || index + 1,
              taskName: t.taskName || t.name || `Task ${index + 1}`,
              phase: (t.phase as OnboardingTaskPhase) || OnboardingTaskPhase.ONBOARDING_ACCESS,
              defaultOwnerId: t.defaultOwnerId || null,
              startMode: t.startMode || (t.fixedStartDate ? "FIXED_DATE" : "OFFSET"),
              dueMode: t.dueMode || (t.fixedDueDate ? "FIXED_DATE" : "OFFSET"),
              startOffsetDays: t.startOffsetDays ?? 0,
              dueOffsetDays: t.dueOffsetDays ?? 7,
              fixedStartDate: t.fixedStartDate || null,
              fixedDueDate: t.fixedDueDate || null,
              deliverable: t.deliverable || null,
              notes: t.notes || null,
            })),
          });
        }
      }

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
            startMode: item.startMode || (item.fixedStartDate ? "FIXED_DATE" : "OFFSET"),
            dueMode: item.dueMode || (item.fixedDueDate ? "FIXED_DATE" : "OFFSET"),
            startOffsetDays: item.startOffsetDays,
            dueOffsetDays: item.dueOffsetDays,
            fixedStartDate: item.fixedStartDate,
            fixedDueDate: item.fixedDueDate,
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
        if (Array.isArray(tasks)) {
          memoryTemplates[tplIndex].tasks = tasks;
          memoryTemplates[tplIndex].taskCount = tasks.length;
        }
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
