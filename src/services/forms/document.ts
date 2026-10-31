import {
  FormDisplayMode,
  FormQuestionType,
  FormResponseMode,
  FormResponseStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { displayValue, type QuestionShape, type StoredAnswer } from "./answers";
import { decryptToken, slugKey } from "./sanitize";
import { assertUniqueFormTitle, httpError, loadForm, responseCount, type LoadedForm } from "./shared";
import { structuralLockMessage } from "./publish";

const TYPE_TO_UI: Record<string, string> = {
  SINGLE_CHOICE: "single_choice",
  MULTIPLE_CHOICE: "multiple_choice",
  DROPDOWN: "dropdown",
  SHORT_TEXT: "short_text",
  LONG_TEXT: "long_text",
  RATING: "rating",
  DATE: "date",
  NUMBER: "number",
  PRICE: "price",
  FEES: "fees",
  YES_NO: "yes_no",
  IMAGE_UPLOAD: "image",
  IMAGE_CHOICE: "image",
  EMAIL: "email",
  PHONE: "phone",
  CONTENT: "content",
};

const OP_TO_UI: Record<string, string> = {
  is: "is",
  is_not: "is not",
  is_any_of: "is any of",
  contains: "contains",
  does_not_contain: "does not contain",
  contains_any_of: "contains any of",
  contains_all_of: "contains all of",
  equals: "equals",
  does_not_equal: "does not equal",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  eq: "=",
  neq: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  between: "between",
  is_on: "is on",
  is_before: "is before",
  is_after: "is after",
  is_between: "is between",
  is_answered: "is answered",
  is_not_answered: "is not answered",
};

const OP_TO_API = Object.fromEntries(Object.entries(OP_TO_UI).map(([api, ui]) => [ui, api]));

function uiType(type: string, config: Record<string, unknown>) {
  if (type === "image") return config.imageMode === "choice" ? FormQuestionType.IMAGE_CHOICE : FormQuestionType.IMAGE_UPLOAD;
  const mapped = type.toUpperCase() as FormQuestionType;
  return Object.values(FormQuestionType).includes(mapped) ? mapped : FormQuestionType.SHORT_TEXT;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type UiLogic = {
  action?: string;
  match?: string;
  conditions?: Array<{ id?: string; sourceQuestionId: string; operator: string; value?: string }>;
};

type UiQuestion = {
  id: string;
  key?: string;
  type: string;
  label: string;
  helpText?: string;
  required?: boolean;
  options?: Array<{ id?: string; label: string; isOther?: boolean }>;
  config?: Record<string, unknown>;
  logic?: UiLogic | null;
};

type UiSection = {
  id: string;
  title: string;
  description?: string;
  questions?: UiQuestion[];
  logic?: UiLogic | null;
};

export type UiDocument = {
  title?: string;
  displayTitle?: string;
  description?: string;
  instructions?: string;
  confirmationMessage?: string;
  redirectUrl?: string;
  responseMode?: string;
  recordPracticeWhenAnonymous?: boolean;
  oneResponse?: boolean;
  displayMode?: string;
  showProgress?: boolean;
  showNumbers?: boolean;
  allowResume?: boolean;
  closeAt?: string | null;
  sendAt?: string | null;
  timezone?: string;
  publicLinkEnabled?: boolean;
  lockVersion?: number;
  sections?: UiSection[];
  email?: { subject?: string; body?: string; senderName?: string; replyTo?: string };
  reminder?: {
    enabled?: boolean;
    firstAfterDays?: number;
    repeatEveryDays?: number;
    maxCount?: number;
    finalBeforeCloseDays?: number | null;
    subject?: string;
    body?: string;
  };
};

function logicOf(
  targetType: string,
  targetId: string,
  form: LoadedForm,
): UiLogic | null {
  const rule = form.logicRules.find((item) => item.targetType === targetType && item.targetId === targetId);
  if (!rule) return null;
  return {
    action: rule.action === "hide" ? "HIDE" : "SHOW",
    match: rule.matchType === "any" ? "ANY" : "ALL",
    conditions: rule.conditions.map((condition) => ({
      id: condition.id,
      sourceQuestionId: condition.sourceQuestionId,
      operator: OP_TO_UI[condition.operator] || condition.operator,
      value: condition.valueJson == null ? "" : Array.isArray(condition.valueJson) ? (condition.valueJson as unknown[]).join(", ") : String(condition.valueJson),
    })),
  };
}

function answerText(question: QuestionShape, stored: StoredAnswer) {
  const shown = displayValue(question, stored);
  if (question.type === "MULTIPLE_CHOICE" || (question.type === "DROPDOWN" && question.config.multi) || (question.type === "IMAGE_CHOICE" && question.config.selectMode === "multi")) {
    return shown ? shown.split("; ").filter(Boolean) : [];
  }
  return shown;
}

export async function readDocument(formId: string) {
  const form = await loadForm(formId);
  if (!form) return null;
  const [recipients, responses] = await Promise.all([
    prisma.formRecipient.findMany({ where: { formId }, orderBy: { createdAt: "asc" } }),
    prisma.formResponse.findMany({
      where: { formId, status: FormResponseStatus.SUBMITTED },
      include: { answers: true, recipient: true },
      orderBy: { submittedAt: "asc" },
    }),
  ]);
  const questions: QuestionShape[] = form.questions.map((question) => ({
    id: question.id,
    key: question.key,
    type: question.type,
    label: question.label,
    isRequired: question.isRequired,
    sectionId: question.sectionId,
    config: (question.configJson || {}) as Record<string, unknown>,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.value,
      isOther: option.isOther,
    })),
  }));
  const ownerName = [form.owner.firstName, form.owner.lastName].filter(Boolean).join(" ");
  return {
    id: form.id,
    refCode: form.refCode,
    title: form.title,
    displayTitle: form.displayTitle || "",
    description: form.description || "",
    instructions: form.instructions || "",
    status: form.status,
    scheduled: form.status === "PUBLISHED" && !!form.sendAt && form.sendAt.getTime() > Date.now(),
    owner: ownerName,
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
    version: form.versionNo,
    lockVersion: form.lockVersion,
    responseMode: form.responseMode,
    recordPracticeWhenAnonymous: form.recordPracticeWhenAnonymous,
    oneResponse: !form.allowMultipleResponses,
    displayMode: form.displayMode,
    showProgress: form.showProgressBar,
    showNumbers: form.showQuestionNumbers,
    allowResume: form.allowSaveResume,
    confirmationMessage: form.confirmationMessage || "Thank you. Your response has been recorded.",
    redirectUrl: form.redirectUrl || "",
    closeAt: form.closeAt?.toISOString() || null,
    sendAt: form.sendAt?.toISOString() || null,
    timezone: form.timezone,
    publicLinkEnabled: form.publicLinkEnabled,
    publicToken: form.publicLinkTokenEncrypted ? decryptToken(form.publicLinkTokenEncrypted) : "",
    sections: form.sections.filter((section) => form.questions.some((question) => question.sectionId === section.id)).map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description || "",
      logic: logicOf("section", section.id, form),
      questions: form.questions
        .filter((question) => question.sectionId === section.id)
        .map((question) => {
          const config = { ...((question.configJson || {}) as Record<string, unknown>) };
          if (question.type === "IMAGE_CHOICE") config.imageMode = config.imageMode || "choice";
          if (question.type === "IMAGE_UPLOAD") config.imageMode = config.imageMode || "upload";
          return {
            id: question.id,
            key: question.key,
            type: TYPE_TO_UI[question.type] || "short_text",
            label: question.label,
            helpText: question.helpText || "",
            required: question.isRequired,
            config,
            logic: logicOf("question", question.id, form),
            options: question.options.map((option) => ({
              id: option.id,
              label: option.label,
              isOther: option.isOther,
            })),
          };
        }),
    })),
    recipients: recipients.map((recipient) => ({
      id: recipient.id,
      source: recipient.sourceType,
      practice: recipient.practiceName || "",
      name: recipient.displayName || recipient.email,
      email: recipient.email,
      status: recipient.status === "FAILED" ? "BOUNCED" : recipient.status,
      delivery: recipient.deliveryStatus,
      token: "",
      sentAt: recipient.sentAt?.toISOString() || null,
      openedAt: recipient.openedAt?.toISOString() || null,
      completedAt: recipient.completedAt?.toISOString() || null,
      reminderCount: recipient.reminderCount,
      lastReminderAt: recipient.lastReminderAt?.toISOString() || null,
    })),
    responses: responses.map((response) => {
      const answers: Record<string, string | string[]> = {};
      for (const answer of response.answers) {
        const question = questions.find((item) => item.id === answer.questionId);
        if (!question) continue;
        const stored: StoredAnswer = {
          valueText: answer.valueText,
          valueNumber: answer.valueNumber === null ? null : Number(answer.valueNumber),
          valueDate: answer.valueDate,
          valueJson: answer.valueJson,
          fileRefs: answer.fileRefs,
        };
        answers[question.id] = answerText(question, stored);
      }
      const anonymous = form.responseMode === "ANONYMOUS";
      return {
        id: response.id,
        recipientId: anonymous ? null : response.recipientId,
        practice: anonymous && !form.recordPracticeWhenAnonymous ? "" : response.recipient?.practiceName || "",
        respondent: anonymous ? "Anonymous" : response.recipient?.displayName || "Respondent",
        submittedAt: (response.submittedAt || response.createdAt).toISOString(),
        answers,
      };
    }),
    reminder: {
      enabled: form.reminderSetting?.enabled || false,
      firstAfterDays: form.reminderSetting?.firstAfterDays || 3,
      repeatEveryDays: form.reminderSetting?.repeatEveryDays || 3,
      maxCount: form.reminderSetting?.maxCount || 2,
      finalBeforeCloseDays: form.reminderSetting?.finalBeforeCloseDays ?? null,
      subject: form.reminderSetting?.subject || "Reminder: {{form_title}}",
      body: form.reminderSetting?.body || "",
    },
    email: {
      subject: form.inviteSubject,
      body: form.inviteBody,
      senderName: form.senderName || ownerName,
      replyTo: form.replyTo || "",
    },
  };
}

export async function writeDocument(formId: string, body: UiDocument, lockVersion: unknown) {
  const form = await loadForm(formId);
  if (!form) throw httpError(404, "Form not found.");
  if (lockVersion !== undefined && lockVersion !== null && Number(lockVersion) !== form.lockVersion) {
    throw httpError(409, "This form was updated by someone else. Reload and try again.");
  }
  if (form.status === "ARCHIVED" || form.status === "CLOSED") {
    throw httpError(409, "Closed and archived forms cannot be edited.");
  }
  const hasResponses = (await responseCount(formId)) > 0;
  if (body.title !== undefined) {
    const title = String(body.title).trim().slice(0, 200);
    if (title.toLowerCase() !== form.title.trim().toLowerCase()) await assertUniqueFormTitle(title, [formId]);
  }
  const sections = (body.sections || []).filter((section) => (section.questions || []).length > 0);
  if (sections.length === 0) throw httpError(400, "Add at least one question before saving this form.");
  for (const section of sections) {
    for (const question of section.questions || []) {
      const min = question.config?.min;
      const max = question.config?.max;
      if (min === undefined || min === "" || max === undefined || max === "") continue;
      if (question.type === "date") {
        if (String(min) > String(max)) {
          throw httpError(400, `${question.label || "This question"} cannot have a minimum later than its maximum.`);
        }
        continue;
      }
      if (!["number", "price", "fees"].includes(question.type)) continue;
      const low = Number(min);
      const high = Number(max);
      if (Number.isFinite(low) && Number.isFinite(high) && high < low) {
        throw httpError(400, `${question.label || "This question"} cannot have a maximum less than its minimum.`);
      }
    }
  }
  if (hasResponses && structureChanged(form, sections)) {
    throw httpError(409, "This form already has responses, so its structure is locked.", structuralLockMessage());
  }

  await prisma.$transaction(async (tx) => {
    await tx.form.update({
      where: { id: formId },
      data: {
        title: body.title !== undefined ? String(body.title).slice(0, 200) : undefined,
        displayTitle: body.displayTitle !== undefined ? String(body.displayTitle).trim().slice(0, 200) || null : undefined,
        description: body.description !== undefined ? String(body.description).slice(0, 2000) : undefined,
        instructions: body.instructions !== undefined ? String(body.instructions) : undefined,
        confirmationMessage: body.confirmationMessage !== undefined ? String(body.confirmationMessage) : undefined,
        redirectUrl: body.redirectUrl !== undefined ? body.redirectUrl || null : undefined,
        responseMode: hasResponses || form.status !== "DRAFT"
          ? undefined
          : body.responseMode === "ANONYMOUS"
            ? FormResponseMode.ANONYMOUS
            : body.responseMode === "IDENTIFIED"
              ? FormResponseMode.IDENTIFIED
              : undefined,
        recordPracticeWhenAnonymous: body.recordPracticeWhenAnonymous,
        allowMultipleResponses: hasResponses ? undefined : body.oneResponse === undefined ? undefined : !body.oneResponse,
        displayMode: body.displayMode === "MULTI_PAGE" ? FormDisplayMode.MULTI_PAGE : body.displayMode === "SINGLE_PAGE" ? FormDisplayMode.SINGLE_PAGE : undefined,
        showProgressBar: body.showProgress,
        showQuestionNumbers: body.showNumbers,
        allowSaveResume: body.allowResume,
        closeAt: body.closeAt !== undefined ? (body.closeAt ? new Date(body.closeAt) : null) : undefined,
        sendAt: body.sendAt !== undefined && !form.invitesDispatchedAt ? (body.sendAt ? new Date(body.sendAt) : null) : undefined,
        timezone: body.timezone,
        publicLinkEnabled: body.publicLinkEnabled,
        inviteSubject: body.email?.subject || undefined,
        inviteBody: body.email?.body && String(body.email.body).includes("{{form_link}}") ? String(body.email.body) : undefined,
        senderName: body.email?.senderName,
        replyTo: body.email?.replyTo || null,
        lockVersion: { increment: 1 },
      },
    });

    if (body.reminder) {
      await tx.formReminderSetting.upsert({
        where: { formId },
        create: {
          formId,
          enabled: Boolean(body.reminder.enabled),
          firstAfterDays: Number(body.reminder.firstAfterDays || 3),
          repeatEveryDays: Number(body.reminder.repeatEveryDays || 3),
          maxCount: Math.min(5, Math.max(1, Number(body.reminder.maxCount || 2))),
          finalBeforeCloseDays: body.reminder.finalBeforeCloseDays ?? null,
          subject: body.reminder.subject || "Reminder: {{form_title}}",
          body: body.reminder.body || "",
        },
        update: {
          enabled: Boolean(body.reminder.enabled),
          firstAfterDays: Number(body.reminder.firstAfterDays || 3),
          repeatEveryDays: Number(body.reminder.repeatEveryDays || 3),
          maxCount: Math.min(5, Math.max(1, Number(body.reminder.maxCount || 2))),
          finalBeforeCloseDays: body.reminder.finalBeforeCloseDays ?? null,
          subject: body.reminder.subject || "Reminder: {{form_title}}",
          body: body.reminder.body || "",
        },
      });
    }

    if (!hasResponses) {
      await replaceStructure(tx, formId, sections);
    } else {
      await patchWording(tx, form, sections);
      await appendOptionalQuestions(tx, form, sections);
    }
    await deleteEmptySections(tx, formId);
  });

  return readDocument(formId);
}

function structureChanged(form: LoadedForm, sections: UiSection[]) {
  const currentQuestions = form.questions.map((question) => question.id).sort().join();
  const nextQuestions = sections.flatMap((section) => section.questions || []).map((question) => question.id).sort().join();
  if (currentQuestions !== nextQuestions) {
    const current = new Set(form.questions.map((question) => question.id));
    const next = sections.flatMap((section) => section.questions || []);
    const removed = [...current].some((id) => !next.some((question) => question.id === id));
    const typeChanged = next.some((question) => {
      const existing = form.questions.find((item) => item.id === question.id);
      if (!existing) return false;
      return uiType(question.type, question.config || {}) !== existing.type;
    });
    return removed || typeChanged;
  }
  return false;
}

async function replaceStructure(tx: Prisma.TransactionClient, formId: string, sections: UiSection[]) {
  await tx.formLogicRule.deleteMany({ where: { formId } });
  const keepSections = new Set<string>();
  const keepQuestions = new Set<string>();
  for (const [sectionIndex, section] of sections.entries()) {
    if (!isUuid(section.id) || !(section.questions || []).length) continue;
    keepSections.add(section.id);
    await tx.formSection.upsert({
      where: { id: section.id },
      create: {
        id: section.id,
        formId,
        title: section.title || `Section ${sectionIndex + 1}`,
        description: section.description || null,
        orderIndex: sectionIndex,
      },
      update: {
        title: section.title || `Section ${sectionIndex + 1}`,
        description: section.description || null,
        orderIndex: sectionIndex,
        deletedAt: null,
      },
    });
    for (const [questionIndex, question] of (section.questions || []).entries()) {
      if (!isUuid(question.id)) continue;
      keepQuestions.add(question.id);
      const existing = await tx.formQuestion.findUnique({ where: { id: question.id } });
      const data = {
        sectionId: section.id,
        type: uiType(question.type, question.config || {}),
        label: String(question.label || "Untitled question").slice(0, 500),
        helpText: question.helpText || null,
        isRequired: Boolean(question.required),
        orderIndex: questionIndex,
        configJson: (question.config || {}) as Prisma.InputJsonValue,
        deletedAt: null,
      };
      if (existing) {
        await tx.formQuestion.update({ where: { id: question.id }, data });
      } else {
        await tx.formQuestion.create({
          data: {
            id: question.id,
            formId,
            key: question.key && !question.key.startsWith("key-") ? question.key : slugKey(question.label || "question"),
            ...data,
          },
        });
      }
      await tx.formQuestionOption.deleteMany({ where: { questionId: question.id } });
      for (const [optionIndex, option] of (question.options || []).entries()) {
        await tx.formQuestionOption.create({
          data: {
            id: option.id && isUuid(option.id) ? option.id : undefined,
            questionId: question.id,
            label: option.label,
            value: slugKey(option.label || "option"),
            isOther: Boolean(option.isOther),
            orderIndex: optionIndex,
          },
        });
      }
    }
  }
  await tx.formQuestion.updateMany({
    where: {
      formId,
      ...(keepQuestions.size ? { id: { notIn: [...keepQuestions] } } : {}),
    },
    data: { deletedAt: new Date() },
  });
  await tx.formSection.updateMany({
    where: {
      formId,
      ...(keepSections.size ? { id: { notIn: [...keepSections] } } : {}),
    },
    data: { deletedAt: new Date() },
  });

  for (const section of sections) {
    await writeRule(tx, formId, "section", section.id, section.logic);
    for (const question of section.questions || []) {
      await writeRule(tx, formId, "question", question.id, question.logic);
    }
  }
}

async function deleteEmptySections(tx: Prisma.TransactionClient, formId: string) {
  const empty = await tx.formSection.findMany({
    where: { formId, deletedAt: null, questions: { none: { deletedAt: null } } },
    select: { id: true },
  });
  if (!empty.length) return;
  await tx.formSection.updateMany({
    where: { id: { in: empty.map((section) => section.id) } },
    data: { deletedAt: new Date() },
  });
}

async function patchWording(tx: Prisma.TransactionClient, form: LoadedForm, sections: UiSection[]) {
  for (const section of sections) {
    if (!form.sections.some((item) => item.id === section.id)) continue;
    await tx.formSection.update({
      where: { id: section.id },
      data: { title: section.title, description: section.description || null },
    });
    for (const question of section.questions || []) {
      const existing = form.questions.find((item) => item.id === question.id);
      if (!existing) continue;
      await tx.formQuestion.update({
        where: { id: question.id },
        data: { label: String(question.label || existing.label).slice(0, 500), helpText: question.helpText || null },
      });
      for (const option of question.options || []) {
        if (!option.id) continue;
        await tx.formQuestionOption.updateMany({
          where: { id: option.id, questionId: question.id },
          data: { label: option.label },
        });
      }
    }
  }
}

async function appendOptionalQuestions(tx: Prisma.TransactionClient, form: LoadedForm, sections: UiSection[]) {
  const ordered = [...form.sections].sort((a, b) => a.orderIndex - b.orderIndex);
  const last = ordered[ordered.length - 1];
  if (!last) return;
  const known = new Set(form.questions.map((question) => question.id));
  const additions: Array<{ sectionId: string; question: UiQuestion }> = [];
  for (const section of sections) {
    for (const question of section.questions || []) {
      if (!isUuid(question.id) || known.has(question.id)) continue;
      additions.push({ sectionId: section.id, question });
    }
  }
  if (!additions.length) return;
  if (additions.some((item) => item.sectionId !== last.id || item.question.required)) {
    throw httpError(
      409,
      "After responses, you can only add an optional question at the end of the last section.",
      structuralLockMessage(),
    );
  }
  const base = form.questions.filter((question) => question.sectionId === last.id).length;
  for (const [index, item] of additions.entries()) {
    const question = item.question;
    await tx.formQuestion.create({
      data: {
        id: question.id,
        formId: form.id,
        sectionId: last.id,
        key: question.key && !question.key.startsWith("key-") ? question.key : slugKey(question.label || "question"),
        type: uiType(question.type, question.config || {}),
        label: String(question.label || "Untitled question").slice(0, 500),
        helpText: question.helpText || null,
        isRequired: false,
        orderIndex: base + index,
        configJson: (question.config || {}) as Prisma.InputJsonValue,
      },
    });
    for (const [optionIndex, option] of (question.options || []).entries()) {
      await tx.formQuestionOption.create({
        data: {
          id: option.id && isUuid(option.id) ? option.id : undefined,
          questionId: question.id,
          label: option.label,
          value: slugKey(option.label || "option"),
          isOther: Boolean(option.isOther),
          orderIndex: optionIndex,
        },
      });
    }
    await writeRule(tx, form.id, "question", question.id, question.logic);
  }
}

async function writeRule(
  tx: Prisma.TransactionClient,
  formId: string,
  targetType: string,
  targetId: string,
  logic: UiLogic | null | undefined,
) {
  if (!logic?.conditions?.length || !isUuid(targetId)) return;
  const conditions = logic.conditions.filter((condition) => isUuid(condition.sourceQuestionId));
  if (!conditions.length) return;
  await tx.formLogicRule.create({
    data: {
      formId,
      targetType,
      targetId,
      action: logic.action === "HIDE" ? "hide" : "show",
      matchType: logic.match === "ANY" ? "any" : "all",
      conditions: {
        create: conditions.map((condition, index) => ({
            sourceQuestionId: condition.sourceQuestionId,
            operator: OP_TO_API[condition.operator] || condition.operator,
            valueJson: condition.value ?? "",
            orderIndex: index,
          })),
      },
    },
  });
}
