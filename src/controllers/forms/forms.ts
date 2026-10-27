import { Response } from "express";
import {
  FormDisplayMode,
  FormQuestionType,
  FormResponseMode,
  FormStatus,
  FormTemplateVisibility,
} from "../../../generated/prisma/client";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../lib/prisma";
import { canManageAnyTemplate, canPermanentlyDelete, canReadAllForms, canReassignOwner, isAdmin } from "../../services/forms/access";
import { dashboard, loadSubmitted, questionSummary, trends } from "../../services/forms/analytics";
import { questionsFromSnapshot, responseRows } from "../../services/forms/exportFiles";
import { structuralLockMessage, publishErrors } from "../../services/forms/publish";
import { parseEmailList, resolveRecipients } from "../../services/forms/recipients";
import { sanitizeRichText, slugKey, createToken, encryptToken, hashToken, isEmail } from "../../services/forms/sanitize";
import { buildSnapshot, snapshotOf } from "../../services/forms/snapshot";
import {
  assertLock,
  bumpLock,
  canAccessForm,
  canMutateForm,
  DEFAULT_INVITE_BODY,
  httpError,
  loadForm,
  ownerWhere,
  responseCount,
  sendError,
  writeActivity,
} from "../../services/forms/shared";
import { applyMerge, deliverFormEmail, formLink } from "../../services/forms/mailer";
import { decryptToken } from "../../services/forms/sanitize";
import { contentFromForm, createFormFromContent, ensureSystemTemplates, type TemplateContent } from "../../services/forms/templates";
import { FormEmailKind, FormRecipientStatus } from "../../../generated/prisma/client";
import { validateLogicRules } from "../../services/forms/logic";
import QRCode from "qrcode";
import { Prisma } from "../../../generated/prisma/client";

function userId(req: AuthenticatedRequest) {
  if (!req.user?.sub) throw httpError(401, "Unauthorized.");
  return req.user.sub;
}

async function readableForm(req: AuthenticatedRequest) {
  const form = await loadForm(String(req.params.id));
  if (!form || !canAccessForm(form, req.user?.role, userId(req))) {
    throw httpError(404, "Form not found.");
  }
  return form;
}

async function mutableForm(req: AuthenticatedRequest) {
  const form = await readableForm(req);
  if (!canMutateForm(form, req.user?.role, userId(req))) {
    throw httpError(403, "You do not have permission for this action.");
  }
  assertLock(form, req.body?.lockVersion ?? req.query.lockVersion);
  return form;
}

async function counts(formId: string) {
  const [recipients, responses] = await Promise.all([
    prisma.formRecipient.count({ where: { formId, status: { not: FormRecipientStatus.REMOVED } } }),
    prisma.formResponse.count({ where: { formId } }),
  ]);
  return { recipients, responses };
}

function present(form: NonNullable<Awaited<ReturnType<typeof loadForm>>>, extra?: Record<string, unknown>) {
  return {
    id: form.id,
    refCode: form.refCode,
    title: form.title,
    description: form.description,
    instructions: form.instructions,
    status: form.status,
    owner: form.owner,
    versionNo: form.versionNo,
    parentFormId: form.parentFormId,
    templateId: form.templateId,
    responseMode: form.responseMode,
    recordPracticeWhenAnonymous: form.recordPracticeWhenAnonymous,
    minGroupSize: form.minGroupSize,
    allowMultipleResponses: form.allowMultipleResponses,
    allowEditUntilClose: form.allowEditUntilClose,
    displayMode: form.displayMode,
    showProgressBar: form.showProgressBar,
    showQuestionNumbers: form.showQuestionNumbers,
    allowSaveResume: form.allowSaveResume,
    confirmationMessage: form.confirmationMessage,
    redirectUrl: form.redirectUrl,
    privacyNotice: form.privacyNotice,
    sendReceipt: form.sendReceipt,
    sendAt: form.sendAt,
    closeAt: form.closeAt,
    timezone: form.timezone,
    publicLinkEnabled: form.publicLinkEnabled,
    inviteSubject: form.inviteSubject,
    inviteBody: form.inviteBody,
    senderName: form.senderName,
    replyTo: form.replyTo,
    emailBatchSize: form.emailBatchSize,
    lockVersion: form.lockVersion,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
    sections: form.sections,
    questions: form.questions,
    logicRules: form.logicRules.map((rule) => ({
      ...rule,
      summary: undefined,
    })),
    reminderSetting: form.reminderSetting,
    scheduled: form.status === FormStatus.PUBLISHED && !!form.sendAt && form.sendAt.getTime() > Date.now(),
    ...extra,
  };
}

async function locked(formId: string) {
  return (await responseCount(formId)) > 0;
}

export async function listForms(req: AuthenticatedRequest, res: Response) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 25)));
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim().toUpperCase();
    const where: Record<string, unknown> = {
      deletedAt: null,
      ...ownerWhere(req.user?.role, userId(req)),
    };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { refCode: { contains: search, mode: "insensitive" } },
        { owner: { firstName: { contains: search, mode: "insensitive" } } },
        { owner: { lastName: { contains: search, mode: "insensitive" } } },
      ];
    }
    if (status && status in FormStatus) where.status = status;
    if (isAdmin(req.user?.role) && req.query.ownerId) where.ownerId = String(req.query.ownerId);
    if (req.query.from || req.query.to) {
      where.createdAt = {
        ...(req.query.from ? { gte: new Date(String(req.query.from)) } : {}),
        ...(req.query.to ? { lte: new Date(String(req.query.to)) } : {}),
      };
    }
    const sortField = ["title", "createdAt", "updatedAt", "closeAt", "status"].includes(String(req.query.sort))
      ? String(req.query.sort)
      : "updatedAt";
    const direction = String(req.query.direction) === "asc" ? "asc" : "desc";
    const [total, forms] = await Promise.all([
      prisma.form.count({ where }),
      prisma.form.findMany({
        where,
        orderBy: { [sortField]: direction },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { recipients: true, responses: true } },
        },
      }),
    ]);
    return res.json({
      message: "Forms fetched.",
      page,
      pageSize,
      total,
      pagination: {
        totalRecords: total,
        totalPages: Math.ceil(total / pageSize),
        currentPage: page,
        limit: pageSize,
      },
      forms: forms.map((form) => ({
        id: form.id,
        refCode: form.refCode,
        title: form.title,
        status: form.status,
        scheduled: form.status === "PUBLISHED" && !!form.sendAt && form.sendAt.getTime() > Date.now(),
        owner: form.owner,
        createdAt: form.createdAt,
        updatedAt: form.updatedAt,
        recipients: form._count.recipients,
        responses: form._count.responses,
        closeAt: form.closeAt,
        sendAt: form.sendAt,
      })),
    });
  } catch (error) {
    const body = sendError(error, "Unable to list forms.");
    return res.status(body.status).json(body.body);
  }
}

export async function createForm(req: AuthenticatedRequest, res: Response) {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title || title.length > 200) throw httpError(400, "Title is required and must be 200 characters or fewer.");
    const description = req.body?.description ? sanitizeRichText(String(req.body.description)).slice(0, 2000) : undefined;
    const instructions = req.body?.instructions ? sanitizeRichText(String(req.body.instructions)).slice(0, 4000) : undefined;
    const created = await createFormFromContent({
      ownerId: userId(req),
      title,
      content: { description, instructions, sections: [{ title: "Section 1", questions: [] }] },
    });
    await writeActivity({
      userId: userId(req),
      action: "CREATE",
      entityType: "form",
      entityId: created.id,
      formId: created.id,
      ip: req.ip,
    });
    const form = await loadForm(created.id);
    return res.status(201).json({ message: "Form created.", form: present(form!) });
  } catch (error) {
    const body = sendError(error, "Unable to create form.");
    return res.status(body.status).json(body.body);
  }
}

export async function getForm(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await readableForm(req);
    const extra = await counts(form.id);
    const hasResponses = extra.responses > 0;
    return res.json({
      message: "Form fetched.",
      form: present(form, extra),
      lock: hasResponses ? structuralLockMessage() : null,
    });
  } catch (error) {
    const body = sendError(error, "Unable to fetch form.");
    return res.status(body.status).json(body.body);
  }
}

export async function updateForm(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    const hasResponses = await locked(form.id);
    const data: Record<string, unknown> = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title || title.length > 200) throw httpError(400, "Title is required and must be 200 characters or fewer.");
      data.title = title;
    }
    if (req.body.description !== undefined) data.description = sanitizeRichText(String(req.body.description || "")).slice(0, 2000);
    if (req.body.instructions !== undefined) data.instructions = sanitizeRichText(String(req.body.instructions || ""));
    if (req.body.confirmationMessage !== undefined) data.confirmationMessage = sanitizeRichText(String(req.body.confirmationMessage || ""));
    if (req.body.redirectUrl !== undefined) data.redirectUrl = req.body.redirectUrl ? String(req.body.redirectUrl) : null;
    if (req.body.privacyNotice !== undefined) data.privacyNotice = sanitizeRichText(String(req.body.privacyNotice || ""));
    if (req.body.showProgressBar !== undefined) data.showProgressBar = Boolean(req.body.showProgressBar);
    if (req.body.showQuestionNumbers !== undefined) data.showQuestionNumbers = Boolean(req.body.showQuestionNumbers);
    if (req.body.allowSaveResume !== undefined) data.allowSaveResume = Boolean(req.body.allowSaveResume);
    if (req.body.sendReceipt !== undefined) data.sendReceipt = Boolean(req.body.sendReceipt);
    if (req.body.displayMode !== undefined) {
      data.displayMode = req.body.displayMode === "MULTI_PAGE" ? FormDisplayMode.MULTI_PAGE : FormDisplayMode.SINGLE_PAGE;
    }
    if (req.body.responseMode !== undefined || req.body.allowMultipleResponses !== undefined) {
      if (hasResponses) throw httpError(409, "Response mode and the one-response setting are locked.", structuralLockMessage());
      if (form.status !== FormStatus.DRAFT && form.status !== FormStatus.PUBLISHED) {
        throw httpError(409, "Response mode is locked after publish.");
      }
      if (req.body.responseMode !== undefined) {
        if (form.status !== FormStatus.DRAFT) throw httpError(409, "Response mode is fixed once the form is published.");
        data.responseMode = req.body.responseMode === "ANONYMOUS" ? FormResponseMode.ANONYMOUS : FormResponseMode.IDENTIFIED;
      }
      if (req.body.allowMultipleResponses !== undefined && form.status !== FormStatus.DRAFT && hasResponses) {
        throw httpError(409, "The one-response setting is locked.");
      }
      if (req.body.allowMultipleResponses !== undefined) data.allowMultipleResponses = Boolean(req.body.allowMultipleResponses);
    }
    if (req.body.recordPracticeWhenAnonymous !== undefined) data.recordPracticeWhenAnonymous = Boolean(req.body.recordPracticeWhenAnonymous);
    if (req.body.minGroupSize !== undefined) data.minGroupSize = Math.max(1, Number(req.body.minGroupSize) || 3);
    if (req.body.allowEditUntilClose !== undefined) data.allowEditUntilClose = Boolean(req.body.allowEditUntilClose);
    if (req.body.timezone !== undefined) data.timezone = String(req.body.timezone);
    if (canReassignOwner(req.user?.role) && req.body.ownerId) data.ownerId = String(req.body.ownerId);
    data.lockVersion = { increment: 1 };
    const updated = await prisma.form.update({ where: { id: form.id }, data });
    await writeActivity({
      userId: userId(req),
      action: "UPDATE",
      entityType: "form",
      entityId: form.id,
      formId: form.id,
      summary: { edited: true, fields: Object.keys(data) },
      ip: req.ip,
    });
    const fresh = await loadForm(updated.id);
    return res.json({ message: "Form updated.", form: present(fresh!) });
  } catch (error) {
    const body = sendError(error, "Unable to update form.");
    return res.status(body.status).json(body.body);
  }
}

export async function deleteForm(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    if (form.status === FormStatus.DRAFT) {
      await prisma.form.update({ where: { id: form.id }, data: { deletedAt: new Date() } });
      await writeActivity({ userId: userId(req), action: "DELETE", entityType: "form", entityId: form.id, formId: form.id, ip: req.ip });
      return res.json({ message: "Draft form deleted." });
    }
    if (form.status !== FormStatus.ARCHIVED) {
      throw httpError(409, "A published form must be archived before it can be deleted.");
    }
    if (!canPermanentlyDelete(req.user?.role)) {
      throw httpError(403, "Only an admin can permanently delete an archived form.");
    }
    if (String(req.body?.confirmTitle || "") !== form.title) {
      throw httpError(400, "Type the form title to confirm permanent deletion.");
    }
    await prisma.form.delete({ where: { id: form.id } });
    await writeActivity({ userId: userId(req), action: "PERMANENT_DELETE", entityType: "form", entityId: form.id, summary: { title: form.title }, ip: req.ip });
    return res.json({ message: "Archived form permanently deleted." });
  } catch (error) {
    const body = sendError(error, "Unable to delete form.");
    return res.status(body.status).json(body.body);
  }
}

export async function duplicateForm(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await readableForm(req);
    if (!canMutateForm(form, req.user?.role, userId(req)) && !isAdmin(req.user?.role)) {
      throw httpError(403, "You do not have permission for this action.");
    }
    const created = await createFormFromContent({
      ownerId: userId(req),
      title: `Copy of ${form.title}`.slice(0, 200),
      content: contentFromForm(form),
    });
    await writeActivity({ userId: userId(req), action: "DUPLICATE", entityType: "form", entityId: created.id, formId: created.id, summary: { sourceId: form.id }, ip: req.ip });
    const copy = await loadForm(created.id);
    return res.status(201).json({ message: "Form duplicated.", form: present(copy!) });
  } catch (error) {
    const body = sendError(error, "Unable to duplicate form.");
    return res.status(body.status).json(body.body);
  }
}

export async function publishForm(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    if (form.status !== FormStatus.DRAFT && form.status !== FormStatus.CLOSED) {
      throw httpError(409, "Only a draft or closed form can be published.");
    }
    const recipientCount = await prisma.formRecipient.count({
      where: { formId: form.id, status: { not: FormRecipientStatus.REMOVED } },
    });
    const errors = publishErrors(form, recipientCount);
    if (errors.length) throw httpError(400, "Publishing is blocked until these items are fixed.", { errors });
    const snapshot = buildSnapshot(form);
    const updated = await prisma.form.update({
      where: { id: form.id },
      data: {
        status: FormStatus.PUBLISHED,
        publishedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        lockVersion: { increment: 1 },
      },
    });
    await writeActivity({ userId: userId(req), action: "PUBLISH", entityType: "form", entityId: form.id, formId: form.id, ip: req.ip });
    if (form.owner?.email) {
      await deliverFormEmail({
        to: form.owner.email,
        subject: `Form published: ${form.title}`,
        html: `<p>${form.title} is published${form.sendAt ? ` and scheduled for ${form.sendAt.toISOString()}` : " and invitations will be sent now"}.</p>`,
        formId: form.id,
        kind: FormEmailKind.CREATOR_NOTICE,
      }).catch(() => undefined);
    }
    return res.json({ message: "Form published.", formId: updated.id, status: updated.status });
  } catch (error) {
    const body = sendError(error, "Unable to publish form.");
    return res.status(body.status).json(body.body);
  }
}

export async function closeForm(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    if (form.status !== FormStatus.PUBLISHED) throw httpError(409, "Only a published form can be closed.");
    await prisma.$transaction([
      prisma.form.update({
        where: { id: form.id },
        data: { status: FormStatus.CLOSED, closedAt: new Date(), lockVersion: { increment: 1 } },
      }),
      prisma.formRecipient.updateMany({
        where: { formId: form.id, status: { in: [FormRecipientStatus.NOT_OPENED, FormRecipientStatus.IN_PROGRESS, FormRecipientStatus.PENDING] } },
        data: { status: FormRecipientStatus.EXPIRED },
      }),
    ]);
    await writeActivity({ userId: userId(req), action: "CLOSE", entityType: "form", entityId: form.id, formId: form.id, ip: req.ip });
    return res.json({ message: "Form closed." });
  } catch (error) {
    const body = sendError(error, "Unable to close form.");
    return res.status(body.status).json(body.body);
  }
}

export async function reopenForm(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    if (form.status !== FormStatus.CLOSED) throw httpError(409, "Only a closed form can be reopened.");
    const closeAt = req.body?.closeAt ? new Date(String(req.body.closeAt)) : null;
    if (!closeAt || Number.isNaN(closeAt.getTime()) || closeAt.getTime() <= Date.now()) {
      throw httpError(400, "A future closing date is required to reopen.");
    }
    await prisma.$transaction([
      prisma.form.update({
        where: { id: form.id },
        data: { status: FormStatus.PUBLISHED, closeAt, closedAt: null, lockVersion: { increment: 1 } },
      }),
      prisma.formRecipient.updateMany({
        where: { formId: form.id, status: FormRecipientStatus.EXPIRED },
        data: { status: FormRecipientStatus.NOT_OPENED },
      }),
    ]);
    await writeActivity({ userId: userId(req), action: "REOPEN", entityType: "form", entityId: form.id, formId: form.id, summary: { closeAt }, ip: req.ip });
    return res.json({ message: "Form reopened." });
  } catch (error) {
    const body = sendError(error, "Unable to reopen form.");
    return res.status(body.status).json(body.body);
  }
}

export async function archiveForm(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    if (form.status !== FormStatus.CLOSED) throw httpError(409, "Close the form before archiving it.");
    await prisma.form.update({
      where: { id: form.id },
      data: { status: FormStatus.ARCHIVED, lockVersion: { increment: 1 } },
    });
    await writeActivity({ userId: userId(req), action: "ARCHIVE", entityType: "form", entityId: form.id, formId: form.id, ip: req.ip });
    return res.json({ message: "Form archived." });
  } catch (error) {
    const body = sendError(error, "Unable to archive form.");
    return res.status(body.status).json(body.body);
  }
}

export async function restoreForm(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isAdmin(req.user?.role)) throw httpError(403, "Only an admin can restore an archived form.");
    const form = await readableForm(req);
    if (form.status !== FormStatus.ARCHIVED) throw httpError(409, "Only an archived form can be restored.");
    await prisma.form.update({
      where: { id: form.id },
      data: { status: FormStatus.CLOSED, lockVersion: { increment: 1 } },
    });
    await writeActivity({ userId: userId(req), action: "RESTORE", entityType: "form", entityId: form.id, formId: form.id, ip: req.ip });
    return res.json({ message: "Form restored to closed." });
  } catch (error) {
    const body = sendError(error, "Unable to restore form.");
    return res.status(body.status).json(body.body);
  }
}

export async function newVersion(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    if (form.status === FormStatus.DRAFT) throw httpError(409, "Drafts are edited directly. Versioning starts after publish.");
    const created = await createFormFromContent({
      ownerId: userId(req),
      title: form.title,
      content: contentFromForm(form),
    });
    await prisma.form.update({
      where: { id: created.id },
      data: { parentFormId: form.parentFormId || form.id, versionNo: form.versionNo + 1 },
    });
    await writeActivity({ userId: userId(req), action: "NEW_VERSION", entityType: "form", entityId: created.id, formId: created.id, summary: { from: form.id }, ip: req.ip });
    const fresh = await loadForm(created.id);
    return res.status(201).json({ message: "New draft version created.", form: present(fresh!) });
  } catch (error) {
    const body = sendError(error, "Unable to create a new version.");
    return res.status(body.status).json(body.body);
  }
}

function assertBuilder(form: { status: FormStatus }) {
  if (form.status === FormStatus.ARCHIVED || form.status === FormStatus.CLOSED) {
    throw httpError(409, "Closed and archived forms cannot be edited. Reopen or create a new version.");
  }
}

export async function addSection(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    assertBuilder(form);
    const count = form.sections.length;
    const section = await prisma.formSection.create({
      data: {
        formId: form.id,
        title: String(req.body?.title || `Section ${count + 1}`).slice(0, 200),
        description: req.body?.description ? sanitizeRichText(String(req.body.description)) : null,
        orderIndex: count,
      },
    });
    await bumpLock(form.id);
    return res.status(201).json({ message: "Section added.", section });
  } catch (error) {
    const body = sendError(error, "Unable to add section.");
    return res.status(body.status).json(body.body);
  }
}

export async function updateSection(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    assertBuilder(form);
    const section = form.sections.find((item) => item.id === req.params.sid);
    if (!section) throw httpError(404, "Section not found.");
    const updated = await prisma.formSection.update({
      where: { id: section.id },
      data: {
        title: req.body?.title !== undefined ? String(req.body.title).slice(0, 200) : undefined,
        description: req.body?.description !== undefined ? sanitizeRichText(String(req.body.description || "")) : undefined,
      },
    });
    await bumpLock(form.id);
    await writeActivity({ userId: userId(req), action: "EDIT_TEXT", entityType: "section", entityId: section.id, formId: form.id, summary: { edited: true }, ip: req.ip });
    return res.json({ message: "Section updated.", section: updated });
  } catch (error) {
    const body = sendError(error, "Unable to update section.");
    return res.status(body.status).json(body.body);
  }
}

export async function deleteSection(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    assertBuilder(form);
    if (await locked(form.id)) throw httpError(409, "Sections cannot be deleted after responses exist.", structuralLockMessage());
    const section = form.sections.find((item) => item.id === req.params.sid);
    if (!section) throw httpError(404, "Section not found.");
    if (form.sections.length === 1) throw httpError(400, "A form must keep at least one section.");
    const questions = form.questions.filter((question) => question.sectionId === section.id);
    const moveTo = req.body?.moveToSectionId ? String(req.body.moveToSectionId) : "";
    if (questions.length && !req.body?.deleteQuestions && !moveTo) {
      throw httpError(400, "This section has questions. Delete them or move them to another section.");
    }
    if (moveTo) {
      if (!form.sections.some((item) => item.id === moveTo) || moveTo === section.id) {
        throw httpError(400, "Choose another section to move the questions to.");
      }
      await prisma.formQuestion.updateMany({ where: { sectionId: section.id }, data: { sectionId: moveTo } });
    } else if (questions.length) {
      await prisma.formQuestion.updateMany({ where: { sectionId: section.id }, data: { deletedAt: new Date() } });
    }
    await prisma.formSection.update({ where: { id: section.id }, data: { deletedAt: new Date() } });
    await bumpLock(form.id);
    return res.json({ message: "Section deleted." });
  } catch (error) {
    const body = sendError(error, "Unable to delete section.");
    return res.status(body.status).json(body.body);
  }
}

const QUESTION_TYPES = new Set(Object.values(FormQuestionType));

export async function addQuestion(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    assertBuilder(form);
    const type = String(req.body?.type || "");
    if (!QUESTION_TYPES.has(type as FormQuestionType)) throw httpError(400, "Unknown question type.");
    const label = String(req.body?.label || "Untitled question").slice(0, 500);
    const sectionId = String(req.body?.sectionId || form.sections[form.sections.length - 1]?.id || "");
    const section = form.sections.find((item) => item.id === sectionId);
    if (!section) throw httpError(400, "Section not found.");
    const hasResponses = await locked(form.id);
    const isLast = section.id === form.sections[form.sections.length - 1]?.id;
    if (hasResponses && (req.body?.isRequired || !isLast)) {
      throw httpError(409, "After responses exist you can only add an optional question at the end.", structuralLockMessage());
    }
    const orderIndex = form.questions.filter((question) => question.sectionId === section.id).length;
    const question = await prisma.formQuestion.create({
      data: {
        formId: form.id,
        sectionId: section.id,
        key: slugKey(label),
        type: type as FormQuestionType,
        label,
        helpText: req.body?.helpText ? String(req.body.helpText) : null,
        isRequired: hasResponses ? false : Boolean(req.body?.isRequired),
        orderIndex,
        configJson: req.body?.config || {},
      },
    });
    const options = normalizeOptions(req.body?.options);
    for (const [index, option] of options.entries()) {
      await prisma.formQuestionOption.create({
        data: {
          questionId: question.id,
          label: option.label,
          value: slugKey(option.label),
          isOther: option.isOther,
          imageRef: option.imageRef || null,
          orderIndex: index,
        },
      });
    }
    await bumpLock(form.id);
    if (form.status === FormStatus.PUBLISHED) {
      const fresh = await loadForm(form.id);
      await prisma.form.update({ where: { id: form.id }, data: { publishedSnapshot: buildSnapshot(fresh!) as unknown as Prisma.InputJsonValue } });
    }
    return res.status(201).json({ message: "Question added.", questionId: question.id });
  } catch (error) {
    const body = sendError(error, "Unable to add question.");
    return res.status(body.status).json(body.body);
  }
}

function normalizeOptions(value: unknown) {
  if (!value) return [] as Array<{ label: string; isOther: boolean; imageRef?: string }>;
    if (typeof value === "string") {
    return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((label) => ({ label, isOther: false, imageRef: undefined as string | undefined }));
  }
  if (!Array.isArray(value)) return [];
  return value.map((option) => {
    if (typeof option === "string") return { label: option, isOther: false };
    const record = option as { label?: string; isOther?: boolean; imageRef?: string };
    return { label: String(record.label || ""), isOther: Boolean(record.isOther), imageRef: record.imageRef };
  }).filter((option) => option.label.trim());
}

export async function updateQuestion(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    assertBuilder(form);
    const question = form.questions.find((item) => item.id === req.params.qid);
    if (!question) throw httpError(404, "Question not found.");
    const hasResponses = await locked(form.id);
    if (hasResponses && req.body?.type && req.body.type !== question.type) {
      throw httpError(409, "Question type is locked after responses exist.", structuralLockMessage());
    }
    if (req.body?.isRequired === true && hasResponses && !question.isRequired) {
      throw httpError(409, "A new required question cannot be added after responses exist.");
    }
    await prisma.formQuestion.update({
      where: { id: question.id },
      data: {
        label: req.body?.label !== undefined ? String(req.body.label).slice(0, 500) : undefined,
        helpText: req.body?.helpText !== undefined ? String(req.body.helpText || "") : undefined,
        isRequired: req.body?.isRequired !== undefined ? Boolean(req.body.isRequired) : undefined,
        configJson: req.body?.config !== undefined ? req.body.config : undefined,
        type: !hasResponses && req.body?.type ? (req.body.type as FormQuestionType) : undefined,
      },
    });
    if (req.body?.options !== undefined) {
      if (hasResponses) {
        const next = normalizeOptions(req.body.options);
        const existing = question.options.filter((option) => !option.isOther);
        if (next.filter((option) => !option.isOther).length < existing.length) {
          throw httpError(409, "Options cannot be deleted after responses exist.", structuralLockMessage());
        }
      }
      await prisma.formQuestionOption.updateMany({ where: { questionId: question.id }, data: { deletedAt: new Date() } });
      const options = normalizeOptions(req.body.options);
      for (const [index, option] of options.entries()) {
        await prisma.formQuestionOption.create({
          data: {
            questionId: question.id,
            label: option.label,
            value: slugKey(option.label),
            isOther: option.isOther,
            imageRef: option.imageRef || null,
            orderIndex: index,
          },
        });
      }
    }
    await bumpLock(form.id);
    await writeActivity({ userId: userId(req), action: "EDIT_TEXT", entityType: "question", entityId: question.id, formId: form.id, summary: { edited: true }, ip: req.ip });
    return res.json({ message: "Question updated." });
  } catch (error) {
    const body = sendError(error, "Unable to update question.");
    return res.status(body.status).json(body.body);
  }
}

export async function deleteQuestion(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    assertBuilder(form);
    if (await locked(form.id)) throw httpError(409, "Questions cannot be deleted after responses exist.", structuralLockMessage());
    const question = form.questions.find((item) => item.id === req.params.qid);
    if (!question) throw httpError(404, "Question not found.");
    const dependents = form.logicRules.filter((rule) =>
      rule.targetId === question.id || rule.conditions.some((condition) => condition.sourceQuestionId === question.id),
    );
    if (dependents.length && !req.body?.confirm) {
      throw httpError(400, "This question is used by logic rules.", {
        rules: dependents.map((rule) => rule.id),
      });
    }
    if (dependents.length) {
      await prisma.formLogicRule.deleteMany({ where: { id: { in: dependents.map((rule) => rule.id) } } });
    }
    await prisma.formQuestion.update({ where: { id: question.id }, data: { deletedAt: new Date() } });
    await bumpLock(form.id);
    return res.json({ message: "Question deleted." });
  } catch (error) {
    const body = sendError(error, "Unable to delete question.");
    return res.status(body.status).json(body.body);
  }
}

export async function duplicateQuestion(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    assertBuilder(form);
    if (await locked(form.id)) throw httpError(409, "Questions cannot be duplicated after responses exist.", structuralLockMessage());
    const question = form.questions.find((item) => item.id === req.params.qid);
    if (!question) throw httpError(404, "Question not found.");
    const copy = await prisma.formQuestion.create({
      data: {
        formId: form.id,
        sectionId: question.sectionId,
        key: slugKey(question.label),
        type: question.type,
        label: question.label,
        helpText: question.helpText,
        isRequired: question.isRequired,
        orderIndex: question.orderIndex + 1,
        configJson: question.configJson as object,
      },
    });
    for (const option of question.options) {
      await prisma.formQuestionOption.create({
        data: {
          questionId: copy.id,
          label: option.label,
          value: slugKey(option.label),
          isOther: option.isOther,
          imageRef: option.imageRef,
          orderIndex: option.orderIndex,
        },
      });
    }
    await bumpLock(form.id);
    return res.status(201).json({ message: "Question duplicated.", questionId: copy.id });
  } catch (error) {
    const body = sendError(error, "Unable to duplicate question.");
    return res.status(body.status).json(body.body);
  }
}

export async function reorderForm(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    assertBuilder(form);
    const sections = Array.isArray(req.body?.sections) ? req.body.sections as Array<{ id: string; questionIds?: string[] }> : [];
    const sectionIds = sections.map((section) => section.id).filter((id) => form.sections.some((item) => item.id === id));
    const questionSection = new Map<string, { sectionId: string; orderIndex: number }>();
    sections.forEach((section) => {
      (section.questionIds || []).forEach((questionId, questionIndex) => {
        if (form.questions.some((question) => question.id === questionId)) {
          questionSection.set(questionId, { sectionId: section.id, orderIndex: questionIndex });
        }
      });
    });
    const orderedSections = sectionIds.length
      ? sectionIds.map((id) => form.sections.find((section) => section.id === id)!)
      : form.sections;
    const ordered = orderedSections.flatMap((section) => [
      { id: section.id, kind: "section" as const },
      ...form.questions
        .filter((question) => (questionSection.get(question.id)?.sectionId || question.sectionId) === section.id)
        .sort((a, b) => (questionSection.get(a.id)?.orderIndex ?? a.orderIndex) - (questionSection.get(b.id)?.orderIndex ?? b.orderIndex))
        .map((question) => ({ id: question.id, kind: "question" as const, sectionId: section.id })),
    ]);
    const logicErrors = validateLogicRules({
      rules: form.logicRules.map((rule) => ({
        targetType: rule.targetType === "section" ? "section" as const : "question" as const,
        targetId: rule.targetId,
        action: rule.action === "hide" ? "hide" as const : "show" as const,
        matchType: rule.matchType === "any" ? "any" as const : "all" as const,
        conditions: rule.conditions.map((condition) => ({
          sourceQuestionId: condition.sourceQuestionId,
          operator: condition.operator,
          value: condition.valueJson,
        })),
      })),
      questions: form.questions.map((question) => ({
        id: question.id,
        type: question.type,
        sectionId: questionSection.get(question.id)?.sectionId || question.sectionId,
      })),
      sections: form.sections.map((section) => ({ id: section.id })),
      items: ordered,
    });
    if (logicErrors.length) throw httpError(409, "This order breaks a logic rule.", { errors: logicErrors });
    for (const [sectionIndex, sectionId] of sectionIds.entries()) {
      await prisma.formSection.update({ where: { id: sectionId }, data: { orderIndex: sectionIndex } });
    }
    for (const [questionId, placement] of questionSection) {
      await prisma.formQuestion.update({
        where: { id: questionId },
        data: { orderIndex: placement.orderIndex, sectionId: placement.sectionId },
      });
    }
    await bumpLock(form.id);
    return res.json({ message: "Order saved." });
  } catch (error) {
    const body = sendError(error, "Unable to save order.");
    return res.status(body.status).json(body.body);
  }
}

export async function saveLogic(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    assertBuilder(form);
    if (await locked(form.id)) throw httpError(409, "Logic is locked after responses exist.", structuralLockMessage());
    const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
    const normalized = rules.map((rule: {
      targetType: "question" | "section";
      targetId: string;
      action: "show" | "hide";
      matchType: "all" | "any";
      skipToSectionId?: string;
      conditions: Array<{ sourceQuestionId: string; operator: string; value?: unknown }>;
    }) => ({
      targetType: rule.targetType,
      targetId: rule.targetId,
      action: rule.action,
      matchType: rule.matchType,
      skipToSectionId: rule.skipToSectionId,
      conditions: rule.conditions || [],
    }));
    const ordered = form.sections.flatMap((section) => [
      { id: section.id, kind: "section" as const },
      ...form.questions.filter((question) => question.sectionId === section.id).map((question) => ({
        id: question.id,
        kind: "question" as const,
        sectionId: section.id,
      })),
    ]);
    const errors = validateLogicRules({
      rules: normalized,
      questions: form.questions.map((question) => ({ id: question.id, type: question.type, sectionId: question.sectionId })),
      sections: form.sections.map((section) => ({ id: section.id })),
      items: ordered,
    });
    if (errors.length) throw httpError(400, "Logic rules are invalid.", { errors });
    await prisma.formLogicRule.deleteMany({ where: { formId: form.id } });
    for (const rule of normalized) {
      await prisma.formLogicRule.create({
        data: {
          formId: form.id,
          targetType: rule.targetType,
          targetId: rule.targetId,
          action: rule.action,
          matchType: rule.matchType,
          skipToSectionId: rule.skipToSectionId || null,
          conditions: {
            create: rule.conditions.map((condition: { sourceQuestionId: string; operator: string; value?: unknown }, index: number) => ({
              sourceQuestionId: condition.sourceQuestionId,
              operator: condition.operator,
              valueJson: condition.value === undefined ? Prisma.JsonNull : (condition.value as Prisma.InputJsonValue),
              orderIndex: index,
            })),
          },
        },
      });
    }
    await bumpLock(form.id);
    return res.json({ message: "Logic saved." });
  } catch (error) {
    const body = sendError(error, "Unable to save logic.");
    return res.status(body.status).json(body.body);
  }
}

export async function previewForm(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await readableForm(req);
    return res.json({ message: "Preview ready.", preview: buildSnapshot(form) });
  } catch (error) {
    const body = sendError(error, "Unable to preview form.");
    return res.status(body.status).json(body.body);
  }
}

export async function resolveFormRecipients(req: AuthenticatedRequest, res: Response) {
  try {
    await mutableForm(req);
    const resolved = await resolveRecipients({
      practiceIds: req.body?.practiceIds,
      includePracticePersons: Boolean(req.body?.includePracticePersons),
      personIds: req.body?.personIds,
      practiceEmails: req.body?.practiceEmails,
      emails: parseEmailList(req.body?.emails),
    });
    return res.json({
      message: resolved.duplicatesRemoved ? `${resolved.duplicatesRemoved} duplicates removed.` : "Recipients resolved.",
      ...resolved,
    });
  } catch (error) {
    const body = sendError(error, "Unable to resolve recipients.");
    return res.status(body.status).json(body.body);
  }
}

export async function addRecipients(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    if (form.status === FormStatus.ARCHIVED || form.status === FormStatus.CLOSED) {
      throw httpError(409, "Recipients cannot be added to a closed form.");
    }
    const resolved = await resolveRecipients({
      practiceIds: req.body?.practiceIds,
      includePracticePersons: Boolean(req.body?.includePracticePersons),
      personIds: req.body?.personIds,
      practiceEmails: req.body?.practiceEmails,
      emails: parseEmailList(req.body?.emails),
    });
    const wave = (await prisma.formRecipient.aggregate({ where: { formId: form.id }, _max: { wave: true } }))._max.wave || 0;
    let added = 0;
    for (const recipient of resolved.recipients) {
      const existing = await prisma.formRecipient.findUnique({
        where: { formId_emailNormalized: { formId: form.id, emailNormalized: recipient.emailNormalized } },
      });
      if (existing) continue;
      const token = createToken();
      await prisma.formRecipient.create({
        data: {
          ...recipient,
          formId: form.id,
          tokenHash: hashToken(token),
          tokenEncrypted: encryptToken(token),
          wave: wave + 1,
          status: form.status === FormStatus.PUBLISHED && (!form.sendAt || form.sendAt <= new Date())
            ? FormRecipientStatus.PENDING
            : FormRecipientStatus.PENDING,
        },
      });
      added += 1;
    }
    await writeActivity({ userId: userId(req), action: "ADD_RECIPIENTS", entityType: "form", entityId: form.id, formId: form.id, summary: { added }, ip: req.ip });
    return res.json({ message: "Recipients saved.", added, duplicatesRemoved: resolved.duplicatesRemoved, excluded: resolved.excluded });
  } catch (error) {
    const body = sendError(error, "Unable to add recipients.");
    return res.status(body.status).json(body.body);
  }
}

export async function removeRecipient(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    const recipient = await prisma.formRecipient.findFirst({ where: { id: String(req.params.rid), formId: form.id } });
    if (!recipient) throw httpError(404, "Recipient not found.");
    await prisma.formRecipient.update({
      where: { id: recipient.id },
      data: { status: FormRecipientStatus.REMOVED, removedAt: new Date() },
    });
    await writeActivity({ userId: userId(req), action: "REMOVE_RECIPIENT", entityType: "recipient", entityId: recipient.id, formId: form.id, ip: req.ip });
    return res.json({ message: "Recipient removed and link revoked." });
  } catch (error) {
    const body = sendError(error, "Unable to remove recipient.");
    return res.status(body.status).json(body.body);
  }
}

export async function listRecipients(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await readableForm(req);
    const status = String(req.query.status || "");
    const recipients = await prisma.formRecipient.findMany({
      where: {
        formId: form.id,
        ...(status ? { status: status as FormRecipientStatus } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        sourceType: true,
        practiceId: true,
        personId: true,
        email: true,
        displayName: true,
        practiceName: true,
        status: true,
        deliveryStatus: true,
        sentAt: true,
        openedAt: true,
        completedAt: true,
        reminderCount: true,
        lastReminderAt: true,
        wave: true,
        lastError: true,
      },
    });
    return res.json({ message: "Recipients fetched.", recipients });
  } catch (error) {
    const body = sendError(error, "Unable to list recipients.");
    return res.status(body.status).json(body.body);
  }
}

export async function saveDistribution(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    if (form.status === FormStatus.ARCHIVED) throw httpError(409, "Archived forms cannot be changed.");
    const data: Record<string, unknown> = { lockVersion: { increment: 1 } };
    if (req.body?.sendAt !== undefined) {
      data.sendAt = req.body.sendAt ? new Date(String(req.body.sendAt)) : null;
      if (form.invitesDispatchedAt) throw httpError(409, "Invitations have already been sent.");
    }
    if (req.body?.closeAt !== undefined) {
      const closeAt = req.body.closeAt ? new Date(String(req.body.closeAt)) : null;
      if (closeAt && form.sendAt && closeAt <= (data.sendAt as Date || form.sendAt)) {
        throw httpError(400, "Closing date must be after the send time.");
      }
      data.closeAt = closeAt;
    }
    if (req.body?.timezone) data.timezone = String(req.body.timezone);
    if (req.body?.publicLinkEnabled !== undefined) data.publicLinkEnabled = Boolean(req.body.publicLinkEnabled);
    if (req.body?.regeneratePublicLink) {
      const token = createToken();
      data.publicLinkTokenHash = hashToken(token);
      data.publicLinkTokenEncrypted = encryptToken(token);
    }
    if (req.body?.inviteSubject !== undefined) data.inviteSubject = String(req.body.inviteSubject).slice(0, 200);
    if (req.body?.inviteBody !== undefined) {
      const body = String(req.body.inviteBody);
      if (!body.includes("{{form_link}}")) throw httpError(400, "The invitation must include {{form_link}}.");
      data.inviteBody = sanitizeRichText(body);
    }
    if (req.body?.senderName !== undefined) data.senderName = String(req.body.senderName || "");
    if (req.body?.replyTo !== undefined) {
      if (req.body.replyTo && !isEmail(String(req.body.replyTo))) throw httpError(400, "Reply-to must be an email.");
      data.replyTo = req.body.replyTo ? String(req.body.replyTo) : null;
    }
    if (req.body?.emailBatchSize !== undefined) data.emailBatchSize = Math.min(500, Math.max(1, Number(req.body.emailBatchSize) || 100));
    if (req.body?.responseMode !== undefined) {
      if (form.status !== FormStatus.DRAFT) throw httpError(409, "Response mode is fixed once the form is published.");
      data.responseMode = req.body.responseMode === "ANONYMOUS" ? FormResponseMode.ANONYMOUS : FormResponseMode.IDENTIFIED;
    }
    if (req.body?.allowMultipleResponses !== undefined) {
      if (await locked(form.id)) throw httpError(409, "The one-response setting is locked.", structuralLockMessage());
      data.allowMultipleResponses = Boolean(req.body.allowMultipleResponses);
    }
    await prisma.form.update({ where: { id: form.id }, data });
    if (req.body?.reminder) {
      const reminder = req.body.reminder as Record<string, unknown>;
      await prisma.formReminderSetting.upsert({
        where: { formId: form.id },
        create: {
          formId: form.id,
          enabled: Boolean(reminder.enabled),
          firstAfterDays: Number(reminder.firstAfterDays || 3),
          repeatEveryDays: Number(reminder.repeatEveryDays || 3),
          maxCount: Math.min(5, Math.max(1, Number(reminder.maxCount || 2))),
          finalBeforeCloseDays: reminder.finalBeforeCloseDays ? Number(reminder.finalBeforeCloseDays) : null,
          subject: String(reminder.subject || "Reminder: {{form_title}}"),
          body: sanitizeRichText(String(reminder.body || "")),
        },
        update: {
          enabled: reminder.enabled !== undefined ? Boolean(reminder.enabled) : undefined,
          firstAfterDays: reminder.firstAfterDays !== undefined ? Number(reminder.firstAfterDays) : undefined,
          repeatEveryDays: reminder.repeatEveryDays !== undefined ? Number(reminder.repeatEveryDays) : undefined,
          maxCount: reminder.maxCount !== undefined ? Math.min(5, Math.max(1, Number(reminder.maxCount))) : undefined,
          finalBeforeCloseDays: reminder.finalBeforeCloseDays !== undefined ? Number(reminder.finalBeforeCloseDays) : undefined,
          subject: reminder.subject !== undefined ? String(reminder.subject) : undefined,
          body: reminder.body !== undefined ? sanitizeRichText(String(reminder.body)) : undefined,
        },
      });
    }
    await writeActivity({ userId: userId(req), action: "DISTRIBUTION", entityType: "form", entityId: form.id, formId: form.id, ip: req.ip });
    return res.json({ message: "Distribution saved." });
  } catch (error) {
    const body = sendError(error, "Unable to save distribution.");
    return res.status(body.status).json(body.body);
  }
}

export async function testEmail(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    const token = form.publicLinkTokenEncrypted ? decryptToken(form.publicLinkTokenEncrypted) : "preview";
    const fields = {
      recipient_name: form.owner.firstName,
      practice_name: "Sample practice",
      form_title: form.title,
      form_link: formLink(token),
      closing_date: form.closeAt ? form.closeAt.toISOString() : "not set",
      sender_name: form.senderName || `${form.owner.firstName} ${form.owner.lastName}`,
    };
    await deliverFormEmail({
      to: form.owner.email,
      subject: applyMerge(form.inviteSubject, fields),
      html: applyMerge(form.inviteBody || DEFAULT_INVITE_BODY, fields),
      formId: form.id,
      kind: FormEmailKind.TEST,
    });
    return res.json({ message: "Test email sent." });
  } catch (error) {
    const body = sendError(error, "Unable to send test email.");
    return res.status(body.status).json(body.body);
  }
}

export async function remindNow(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    if (form.status !== FormStatus.PUBLISHED) throw httpError(409, "Reminders are only sent for published forms.");
    const ids: string[] = Array.isArray(req.body?.recipientIds) ? req.body.recipientIds : [];
    const recipients = await prisma.formRecipient.findMany({
      where: {
        formId: form.id,
        status: { in: [FormRecipientStatus.NOT_OPENED, FormRecipientStatus.IN_PROGRESS] },
        ...(ids.length ? { id: { in: ids } } : {}),
      },
    });
    let sent = 0;
    const skipped: string[] = [];
    for (const recipient of recipients) {
      const recent = recipient.lastReminderAt && Date.now() - recipient.lastReminderAt.getTime() < 24 * 60 * 60 * 1000;
      if (recent && !isAdmin(req.user?.role)) {
        skipped.push(recipient.email);
        continue;
      }
      const token = decryptToken(recipient.tokenEncrypted);
      const fields = {
        recipient_name: recipient.displayName || recipient.email,
        practice_name: recipient.practiceName || "",
        form_title: form.title,
        form_link: formLink(token),
        closing_date: form.closeAt ? form.closeAt.toISOString() : "",
        sender_name: form.senderName || form.owner.firstName,
      };
      const result = await deliverFormEmail({
        to: recipient.email,
        subject: applyMerge(form.reminderSetting?.subject || "Reminder: {{form_title}}", fields),
        html: applyMerge(form.reminderSetting?.body || "", fields),
        formId: form.id,
        recipientId: recipient.id,
        kind: FormEmailKind.REMINDER,
      });
      if (result.ok) {
        sent += 1;
        await prisma.formRecipient.update({
          where: { id: recipient.id },
          data: { reminderCount: { increment: 1 }, lastReminderAt: new Date() },
        });
      }
    }
    await writeActivity({ userId: userId(req), action: "REMIND", entityType: "form", entityId: form.id, formId: form.id, summary: { sent }, ip: req.ip });
    return res.json({ message: "Reminders processed.", sent, skipped });
  } catch (error) {
    const body = sendError(error, "Unable to send reminders.");
    return res.status(body.status).json(body.body);
  }
}

export async function publicLinkQr(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await readableForm(req);
    if (!form.publicLinkEnabled || !form.publicLinkTokenEncrypted) throw httpError(404, "Public link is not enabled.");
    const url = formLink(decryptToken(form.publicLinkTokenEncrypted));
    const dataUrl = await QRCode.toDataURL(url);
    return res.json({ message: "QR code ready.", url, dataUrl });
  } catch (error) {
    const body = sendError(error, "Unable to create QR code.");
    return res.status(body.status).json(body.body);
  }
}

function filtersFrom(req: AuthenticatedRequest) {
  return {
    practiceIds: String(req.query.practiceIds || "").split(",").map((id) => id.trim()).filter(Boolean),
    from: req.query.from ? new Date(String(req.query.from)) : null,
    to: req.query.to ? new Date(String(req.query.to)) : null,
    questionId: req.query.questionId ? String(req.query.questionId) : undefined,
    operator: req.query.operator ? String(req.query.operator) : undefined,
    value: req.query.value,
  };
}

export async function analyticsSummary(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await readableForm(req);
    const anonymous = form.responseMode === "ANONYMOUS";
    const summary = await dashboard(form.id, filtersFrom(req), anonymous, form.minGroupSize);
    return res.json({ message: "Dashboard fetched.", summary, generatedAt: new Date().toISOString() });
  } catch (error) {
    const body = sendError(error, "Unable to load dashboard.");
    return res.status(body.status).json(body.body);
  }
}

export async function analyticsOverview(req: AuthenticatedRequest, res: Response) {
  try {
    const forms = await prisma.form.findMany({
      where: { deletedAt: null, ...ownerWhere(req.user?.role, userId(req)) },
      select: { id: true },
    });
    const tiles = { totalSent: 0, responded: 0, inProgress: 0, notOpened: 0, bounced: 0 };
    for (const form of forms) {
      const summary = await dashboard(form.id, {}, false, 3);
      tiles.totalSent += summary.totalSent;
      tiles.responded += summary.responded;
      tiles.inProgress += summary.inProgress;
      tiles.notOpened += summary.notOpened;
      tiles.bounced += summary.bounced;
    }
    const completionRate = tiles.totalSent ? Math.round((tiles.responded / tiles.totalSent) * 1000) / 10 : 0;
    return res.json({ message: "Overview fetched.", summary: { ...tiles, completionRate, forms: forms.length } });
  } catch (error) {
    const body = sendError(error, "Unable to load overview.");
    return res.status(body.status).json(body.body);
  }
}

export async function analyticsQuestions(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await readableForm(req);
    const snapshot = snapshotOf(form);
    const responses = await loadSubmitted(form.id, filtersFrom(req));
    const cards = questionsFromSnapshot(snapshot).map((question) => questionSummary(question, responses));
    return res.json({ message: "Question summaries fetched.", cards });
  } catch (error) {
    const body = sendError(error, "Unable to load question summaries.");
    return res.status(body.status).json(body.body);
  }
}

export async function analyticsTrends(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await readableForm(req);
    const bucket = String(req.query.bucket || "day");
    const responses = await loadSubmitted(form.id, filtersFrom(req));
    const series = trends(
      responses.map((response) => ({ submittedAt: response.submittedAt, practiceId: response.practiceId })),
      bucket === "week" || bucket === "month" ? bucket : "day",
    );
    return res.json({ message: "Trends fetched.", series });
  } catch (error) {
    const body = sendError(error, "Unable to load trends.");
    return res.status(body.status).json(body.body);
  }
}

export async function listResponses(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await readableForm(req);
    const anonymous = form.responseMode === "ANONYMOUS";
    const responses = await loadSubmitted(form.id, filtersFrom(req));
    const practiceCounts = new Map<string, number>();
    for (const response of responses) {
      if (!response.practiceId) continue;
      practiceCounts.set(response.practiceId, (practiceCounts.get(response.practiceId) || 0) + 1);
    }
    return res.json({
      message: "Responses fetched.",
      total: responses.length,
      responses: responses.map((response) => {
        const suppressed = anonymous && !!response.practiceId && (practiceCounts.get(response.practiceId) || 0) < form.minGroupSize;
        return {
          id: response.id,
          submittedAt: response.submittedAt,
          status: response.status,
          respondent: anonymous ? null : response.recipient?.displayName || null,
          email: anonymous ? null : response.recipient?.email || null,
          practice: !form.recordPracticeWhenAnonymous && anonymous ? null : suppressed ? null : response.recipient?.practiceName || null,
          practiceSuppressed: suppressed,
        };
      }),
    });
  } catch (error) {
    const body = sendError(error, "Unable to list responses.");
    return res.status(body.status).json(body.body);
  }
}

export async function getResponse(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await readableForm(req);
    const response = await prisma.formResponse.findFirst({
      where: { id: String(req.params.rid), formId: form.id },
      include: { answers: true, recipient: true },
    });
    if (!response) throw httpError(404, "Response not found.");
    const snapshot = snapshotOf(form);
    const anonymous = form.responseMode === "ANONYMOUS";
    const questions = questionsFromSnapshot(snapshot);
    return res.json({
      message: "Response fetched.",
      response: {
        id: response.id,
        submittedAt: response.submittedAt,
        versionNo: response.formVersionNo,
        respondent: anonymous ? null : response.recipient?.displayName || null,
        practice: anonymous && !form.recordPracticeWhenAnonymous ? null : response.recipient?.practiceName || null,
        answers: questions.map((question) => {
          const answer = response.answers.find((item) => item.questionId === question.id);
          return {
            questionId: question.id,
            key: question.key,
            label: question.label,
            type: question.type,
            value: answer || null,
          };
        }),
      },
    });
  } catch (error) {
    const body = sendError(error, "Unable to fetch response.");
    return res.status(body.status).json(body.body);
  }
}

export async function requestExport(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    if (!canMutateForm(form, req.user?.role, userId(req))) {
      throw httpError(403, "You do not have permission to export.");
    }
    const format = String(req.body?.format || "csv").toLowerCase();
    if (!["csv", "xlsx", "pdf"].includes(format)) throw httpError(400, "Format must be csv, xlsx or pdf.");
    const responses = await loadSubmitted(form.id, {
      practiceIds: req.body?.practiceIds,
      from: req.body?.from ? new Date(req.body.from) : null,
      to: req.body?.to ? new Date(req.body.to) : null,
      questionId: req.body?.questionId,
      operator: req.body?.operator,
      value: req.body?.value,
    });
    const record = await prisma.formExport.create({
      data: {
        formId: form.id,
        requestedById: userId(req),
        format: format.toUpperCase() as "CSV" | "XLSX" | "PDF",
        filters: req.body || {},
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: responses.length > 5000 ? "PENDING" : "PENDING",
      },
    });
    if (responses.length <= 5000) {
      const { writeExportFile } = await import("../../services/forms/exportJob");
      await writeExportFile(record.id);
    }
    await writeActivity({ userId: userId(req), action: "EXPORT", entityType: "form", entityId: form.id, formId: form.id, summary: { format, count: responses.length }, ip: req.ip });
    const saved = await prisma.formExport.findUnique({ where: { id: record.id } });
    return res.status(202).json({
      message: responses.length > 5000 ? "Export queued. You will be notified when it is ready." : "Export ready.",
      export: saved,
    });
  } catch (error) {
    const body = sendError(error, "Unable to export.");
    return res.status(body.status).json(body.body);
  }
}

export async function downloadExport(req: AuthenticatedRequest, res: Response) {
  try {
    const record = await prisma.formExport.findUnique({
      where: { id: String(req.params.eid) },
      include: { form: true },
    });
    if (!record || !canAccessForm(record.form, req.user?.role, userId(req))) {
      throw httpError(404, "Export not found.");
    }
    if (record.expiresAt.getTime() < Date.now() || record.status === "EXPIRED") {
      throw httpError(410, "This download link has expired.");
    }
    if (record.status !== "READY" || !record.localPath) throw httpError(409, "Export is not ready.");
    return res.download(record.localPath, record.fileName || "export");
  } catch (error) {
    const body = sendError(error, "Unable to download export.");
    return res.status(body.status).json(body.body);
  }
}

export async function listActivity(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await readableForm(req);
    if (!isAdmin(req.user?.role) && form.ownerId !== userId(req) && !canReadAllForms(req.user?.role)) {
      throw httpError(404, "Form not found.");
    }
    const logs = await prisma.formActivityLog.findMany({
      where: { formId: form.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return res.json({ message: "Activity fetched.", logs });
  } catch (error) {
    const body = sendError(error, "Unable to fetch activity.");
    return res.status(body.status).json(body.body);
  }
}

export async function listTemplates(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureSystemTemplates();
    const search = String(req.query.search || "").trim();
    const templates = await prisma.formTemplate.findMany({
      where: {
        deletedAt: null,
        hidden: req.query.includeHidden === "true" && isAdmin(req.user?.role) ? undefined : false,
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
        ...(req.query.category ? { category: String(req.query.category) } : {}),
        OR: [
          { isSystem: true },
          { visibility: FormTemplateVisibility.SHARED },
          { ownerId: userId(req) },
          ...(canReadAllForms(req.user?.role) ? [{}] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
    });
    return res.json({
      message: "Templates fetched.",
      templates: templates.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        visibility: template.visibility,
        isSystem: template.isSystem,
        ownerId: template.ownerId,
        versionNo: template.versionNo,
        usageCount: template.usageCount,
        lastUsedAt: template.lastUsedAt,
      })),
    });
  } catch (error) {
    const body = sendError(error, "Unable to list templates.");
    return res.status(body.status).json(body.body);
  }
}

export async function saveAsTemplate(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await readableForm(req);
    if (!canMutateForm(form, req.user?.role, userId(req))) throw httpError(403, "You do not have permission for this action.");
    const name = String(req.body?.name || "").trim();
    if (!name) throw httpError(400, "Template name is required.");
    const template = await prisma.formTemplate.create({
      data: {
        name,
        description: req.body?.description ? String(req.body.description) : null,
        category: String(req.body?.category || "General"),
        visibility: req.body?.visibility === "SHARED" ? FormTemplateVisibility.SHARED : FormTemplateVisibility.PRIVATE,
        ownerId: userId(req),
        contentJson: contentFromForm(form) as unknown as Prisma.InputJsonValue,
      },
    });
    await writeActivity({ userId: userId(req), action: "SAVE_TEMPLATE", entityType: "template", entityId: template.id, formId: form.id, ip: req.ip });
    return res.status(201).json({ message: "Template saved.", templateId: template.id });
  } catch (error) {
    const body = sendError(error, "Unable to save template.");
    return res.status(body.status).json(body.body);
  }
}

async function readableTemplate(req: AuthenticatedRequest) {
  await ensureSystemTemplates();
  const template = await prisma.formTemplate.findFirst({
    where: { id: String(req.params.tid), deletedAt: null },
  });
  if (!template) throw httpError(404, "Template not found.");
  const mine = template.ownerId === userId(req);
  const shared = template.visibility === FormTemplateVisibility.SHARED || template.isSystem;
  if (!mine && !shared && !canReadAllForms(req.user?.role)) throw httpError(404, "Template not found.");
  return template;
}

export async function getTemplate(req: AuthenticatedRequest, res: Response) {
  try {
    const template = await readableTemplate(req);
    return res.json({ message: "Template fetched.", template });
  } catch (error) {
    const body = sendError(error, "Unable to fetch template.");
    return res.status(body.status).json(body.body);
  }
}

export async function useTemplate(req: AuthenticatedRequest, res: Response) {
  try {
    const template = await readableTemplate(req);
    const created = await createFormFromContent({
      ownerId: userId(req),
      title: String(req.body?.title || template.name).slice(0, 200),
      content: template.contentJson as TemplateContent,
      templateId: template.id,
      templateVersionNo: template.versionNo,
    });
    await prisma.formTemplate.update({
      where: { id: template.id },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    const form = await loadForm(created.id);
    return res.status(201).json({ message: "Form created from template.", form: present(form!) });
  } catch (error) {
    const body = sendError(error, "Unable to use template.");
    return res.status(body.status).json(body.body);
  }
}

export async function updateTemplate(req: AuthenticatedRequest, res: Response) {
  try {
    const template = await readableTemplate(req);
    if (template.isSystem) throw httpError(403, "System templates can only be saved as a new template.");
    const owner = template.ownerId === userId(req);
    if (!owner && !canManageAnyTemplate(req.user?.role)) throw httpError(403, "You can only edit your own templates.");
    if (req.body?.mode === "new") {
      const name = String(req.body?.name || "").trim();
      if (!name) throw httpError(400, "A new template name is required.");
      const created = await prisma.formTemplate.create({
        data: {
          name,
          description: req.body?.description ? String(req.body.description) : template.description,
          category: String(req.body?.category || template.category),
          visibility: req.body?.visibility === "SHARED" ? FormTemplateVisibility.SHARED : template.visibility,
          ownerId: userId(req),
          contentJson: req.body?.content || template.contentJson || {},
        },
      });
      return res.status(201).json({ message: "New template saved.", templateId: created.id });
    }
    const updated = await prisma.formTemplate.update({
      where: { id: template.id },
      data: {
        name: req.body?.name ? String(req.body.name) : undefined,
        description: req.body?.description !== undefined ? String(req.body.description || "") : undefined,
        category: req.body?.category ? String(req.body.category) : undefined,
        visibility: req.body?.visibility === "SHARED" ? FormTemplateVisibility.SHARED : req.body?.visibility === "PRIVATE" ? FormTemplateVisibility.PRIVATE : undefined,
        contentJson: req.body?.content !== undefined ? req.body.content : undefined,
        versionNo: { increment: 1 },
      },
    });
    return res.json({ message: "Template updated.", templateId: updated.id, versionNo: updated.versionNo });
  } catch (error) {
    const body = sendError(error, "Unable to update template.");
    return res.status(body.status).json(body.body);
  }
}

export async function deleteTemplate(req: AuthenticatedRequest, res: Response) {
  try {
    const template = await readableTemplate(req);
    if (template.isSystem) {
      if (!isAdmin(req.user?.role)) throw httpError(403, "Only an admin can hide a system template.");
      await prisma.formTemplate.update({ where: { id: template.id }, data: { hidden: true } });
      return res.json({ message: "System template hidden." });
    }
    if (template.ownerId !== userId(req) && !canManageAnyTemplate(req.user?.role)) {
      throw httpError(403, "You can only delete your own templates.");
    }
    await prisma.formTemplate.update({ where: { id: template.id }, data: { deletedAt: new Date() } });
    return res.json({ message: "Template deleted." });
  } catch (error) {
    const body = sendError(error, "Unable to delete template.");
    return res.status(body.status).json(body.body);
  }
}

export async function myForms(req: AuthenticatedRequest, res: Response) {
  try {
    const email = (req.user?.email || "").trim().toLowerCase();
    if (!email) throw httpError(401, "Unauthorized.");
    const recipients = await prisma.formRecipient.findMany({
      where: {
        emailNormalized: email,
        status: { notIn: [FormRecipientStatus.REMOVED] },
        form: { deletedAt: null, status: { in: [FormStatus.PUBLISHED, FormStatus.CLOSED] } },
      },
      include: { form: { select: { id: true, title: true, status: true, closeAt: true } } },
    });
    return res.json({
      message: "Assigned forms fetched.",
      forms: recipients.map((recipient) => ({
        formId: recipient.form.id,
        title: recipient.form.title,
        formStatus: recipient.form.status,
        closeAt: recipient.form.closeAt,
        status: recipient.status,
        practice: recipient.practiceName || "",
        token: decryptToken(recipient.tokenEncrypted),
      })),
    });
  } catch (error) {
    const body = sendError(error, "Unable to list assigned forms.");
    return res.status(body.status).json(body.body);
  }
}

export async function correctRecipientEmail(req: AuthenticatedRequest, res: Response) {
  try {
    const form = await mutableForm(req);
    const recipient = await prisma.formRecipient.findFirst({ where: { id: String(req.params.rid), formId: form.id } });
    if (!recipient) throw httpError(404, "Recipient not found.");
    const email = String(req.body?.email || "").trim();
    if (!isEmail(email)) throw httpError(400, "A valid email is required.");
    const token = createToken();
    await prisma.formRecipient.update({
      where: { id: recipient.id },
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        tokenHash: hashToken(token),
        tokenEncrypted: encryptToken(token),
        status: FormRecipientStatus.PENDING,
        deliveryStatus: "QUEUED",
        attemptCount: 0,
        lastError: null,
      },
    });
    return res.json({ message: "Email corrected. The invitation will be resent." });
  } catch (error) {
    const body = sendError(error, "Unable to correct email.");
    return res.status(body.status).json(body.body);
  }
}
