import {
  FormDisplayMode,
  FormQuestionType,
  FormResponseMode,
  FormTemplateVisibility,
  Prisma,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { createToken, encryptToken, hashToken, slugKey } from "./sanitize";
import { DEFAULT_INVITE_BODY, DEFAULT_REMINDER_BODY, nextRefCode } from "./shared";

type TemplateQuestion = {
  type: string;
  label: string;
  helpText?: string;
  isRequired?: boolean;
  key?: string;
  config?: Record<string, unknown>;
  options?: Array<{ label: string; isOther?: boolean }>;
};

type TemplateSection = {
  title: string;
  description?: string;
  questions: TemplateQuestion[];
};

export type TemplateContent = {
  description?: string;
  instructions?: string;
  confirmationMessage?: string;
  responseMode?: "IDENTIFIED" | "ANONYMOUS";
  allowMultipleResponses?: boolean;
  displayMode?: "SINGLE_PAGE" | "MULTI_PAGE";
  showProgressBar?: boolean;
  showQuestionNumbers?: boolean;
  sections: TemplateSection[];
  logic?: Array<{
    targetKey: string;
    action: "show" | "hide";
    matchType: "all" | "any";
    conditions: Array<{ sourceKey: string; operator: string; value?: unknown }>;
  }>;
  reminder?: {
    enabled?: boolean;
    firstAfterDays?: number;
    repeatEveryDays?: number;
    maxCount?: number;
    subject?: string;
    body?: string;
  };
};

const SYSTEM_TEMPLATES: Array<{ name: string; description: string; category: string; content: TemplateContent }> = [
  {
    name: "Customer satisfaction",
    description: "Short satisfaction survey with a rating and a comment.",
    category: "Feedback",
    content: {
      sections: [
        {
          title: "Section 1",
          questions: [
            { type: "RATING", label: "How satisfied are you?", isRequired: true, config: { scale: 5, style: "stars" } },
            { type: "YES_NO", label: "Would you recommend us?", isRequired: true },
            { type: "LONG_TEXT", label: "What should we improve?" },
          ],
        },
      ],
    },
  },
  {
    name: "Practice feedback",
    description: "Feedback collected from a practice contact.",
    category: "Feedback",
    content: {
      sections: [
        {
          title: "Section 1",
          questions: [
            { type: "SINGLE_CHOICE", label: "How was your recent experience?", isRequired: true, options: [{ label: "Excellent" }, { label: "Good" }, { label: "Fair" }, { label: "Poor" }] },
            { type: "LONG_TEXT", label: "Additional comments" },
          ],
        },
      ],
    },
  },
  {
    name: "Event registration",
    description: "Collect a name, email and attendance confirmation.",
    category: "Registration",
    content: {
      sections: [
        {
          title: "Section 1",
          questions: [
            { type: "SHORT_TEXT", label: "Full name", isRequired: true },
            { type: "EMAIL", label: "Email", isRequired: true },
            { type: "YES_NO", label: "Will you attend?", isRequired: true },
          ],
        },
      ],
    },
  },
];

export async function ensureSystemTemplates() {
  const existing = await prisma.formTemplate.count({ where: { isSystem: true, deletedAt: null } });
  if (existing > 0) return;
  for (const template of SYSTEM_TEMPLATES) {
    await prisma.formTemplate.create({
      data: {
        name: template.name,
        description: template.description,
        category: template.category,
        visibility: FormTemplateVisibility.SHARED,
        isSystem: true,
        contentJson: template.content as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

export async function createFormFromContent(params: {
  ownerId: string;
  title: string;
  content: TemplateContent;
  templateId?: string | null;
  templateVersionNo?: number | null;
}) {
  const content = params.content;
  const refCode = await nextRefCode();
  const keyByLabel = new Map<string, string>();
  return prisma.$transaction(async (tx) => {
    const form = await tx.form.create({
      data: {
        refCode,
        title: params.title.slice(0, 200),
        description: content.description || null,
        instructions: content.instructions || null,
        confirmationMessage: content.confirmationMessage || "Thank you. Your response has been recorded.",
        ownerId: params.ownerId,
        templateId: params.templateId || null,
        templateVersionNo: params.templateVersionNo || null,
        responseMode: content.responseMode === "ANONYMOUS" ? FormResponseMode.ANONYMOUS : FormResponseMode.IDENTIFIED,
        allowMultipleResponses: Boolean(content.allowMultipleResponses),
        displayMode: content.displayMode === "MULTI_PAGE" ? FormDisplayMode.MULTI_PAGE : FormDisplayMode.SINGLE_PAGE,
        showProgressBar: content.showProgressBar !== false,
        showQuestionNumbers: content.showQuestionNumbers !== false,
        inviteBody: DEFAULT_INVITE_BODY,
        publicLinkTokenHash: hashToken(createToken()),
      },
    });
    const publicToken = createToken();
    await tx.form.update({
      where: { id: form.id },
      data: {
        publicLinkTokenHash: hashToken(publicToken),
        publicLinkTokenEncrypted: encryptToken(publicToken),
      },
    });

    const sections = (content.sections || []).filter((section) => (section.questions || []).length > 0);
    const questionIdByKey = new Map<string, string>();
    for (const [sectionIndex, section] of sections.entries()) {
      const createdSection = await tx.formSection.create({
        data: {
          formId: form.id,
          title: section.title || `Section ${sectionIndex + 1}`,
          description: section.description || null,
          orderIndex: sectionIndex,
        },
      });
      for (const [questionIndex, question] of (section.questions || []).entries()) {
        const key = question.key || slugKey(question.label);
        keyByLabel.set(question.label, key);
        const created = await tx.formQuestion.create({
          data: {
            formId: form.id,
            sectionId: createdSection.id,
            key,
            type: (question.type as FormQuestionType) || FormQuestionType.SHORT_TEXT,
            label: question.label.slice(0, 500),
            helpText: question.helpText || null,
            isRequired: Boolean(question.isRequired),
            orderIndex: questionIndex,
            configJson: (question.config || {}) as Prisma.InputJsonValue,
          },
        });
        questionIdByKey.set(key, created.id);
        for (const [optionIndex, option] of (question.options || []).entries()) {
          await tx.formQuestionOption.create({
            data: {
              questionId: created.id,
              label: option.label,
              value: slugKey(option.label),
              isOther: Boolean(option.isOther),
              orderIndex: optionIndex,
            },
          });
        }
      }
    }

    for (const [index, rule] of (content.logic || []).entries()) {
      const targetId = questionIdByKey.get(rule.targetKey);
      if (!targetId) continue;
      const createdRule = await tx.formLogicRule.create({
        data: {
          formId: form.id,
          targetType: "question",
          targetId,
          action: rule.action,
          matchType: rule.matchType,
        },
      });
      for (const [conditionIndex, condition] of rule.conditions.entries()) {
        const sourceId = questionIdByKey.get(condition.sourceKey);
        if (!sourceId) continue;
        await tx.formLogicCondition.create({
          data: {
            ruleId: createdRule.id,
            sourceQuestionId: sourceId,
            operator: condition.operator,
            valueJson: condition.value === undefined ? Prisma.JsonNull : (condition.value as Prisma.InputJsonValue),
            orderIndex: conditionIndex,
          },
        });
      }
      void index;
    }

    await tx.formReminderSetting.create({
      data: {
        formId: form.id,
        enabled: Boolean(content.reminder?.enabled),
        firstAfterDays: content.reminder?.firstAfterDays || 3,
        repeatEveryDays: content.reminder?.repeatEveryDays || 3,
        maxCount: Math.min(5, content.reminder?.maxCount || 2),
        subject: content.reminder?.subject || "Reminder: {{form_title}}",
        body: content.reminder?.body || DEFAULT_REMINDER_BODY,
      },
    });

    return form;
  });
}

export function contentFromForm(form: {
  description: string | null;
  instructions: string | null;
  confirmationMessage: string | null;
  responseMode: FormResponseMode;
  allowMultipleResponses: boolean;
  displayMode: FormDisplayMode;
  showProgressBar: boolean;
  showQuestionNumbers: boolean;
  sections: Array<{ id: string; title: string; description: string | null; orderIndex: number }>;
  questions: Array<{
    id: string;
    sectionId: string;
    key: string;
    type: string;
    label: string;
    helpText: string | null;
    isRequired: boolean;
    orderIndex: number;
    configJson: unknown;
    options: Array<{ label: string; isOther: boolean; orderIndex: number }>;
  }>;
  logicRules: Array<{
    targetType: string;
    targetId: string;
    action: string;
    matchType: string;
    conditions: Array<{ sourceQuestionId: string; operator: string; valueJson: unknown }>;
  }>;
  reminderSetting: {
    enabled: boolean;
    firstAfterDays: number;
    repeatEveryDays: number;
    maxCount: number;
    subject: string;
    body: string;
  } | null;
}): TemplateContent {
  const keyById = new Map(form.questions.map((question) => [question.id, question.key]));
  return {
    description: form.description || undefined,
    instructions: form.instructions || undefined,
    confirmationMessage: form.confirmationMessage || undefined,
    responseMode: form.responseMode,
    allowMultipleResponses: form.allowMultipleResponses,
    displayMode: form.displayMode,
    showProgressBar: form.showProgressBar,
    showQuestionNumbers: form.showQuestionNumbers,
    sections: form.sections
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .filter((section) => form.questions.some((question) => question.sectionId === section.id))
      .map((section) => ({
        title: section.title,
        description: section.description || undefined,
        questions: form.questions
          .filter((question) => question.sectionId === section.id)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((question) => ({
            key: question.key,
            type: question.type,
            label: question.label,
            helpText: question.helpText || undefined,
            isRequired: question.isRequired,
            config: (question.configJson || {}) as Record<string, unknown>,
            options: question.options
              .slice()
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((option) => ({ label: option.label, isOther: option.isOther })),
          })),
      })),
    logic: form.logicRules
      .filter((rule) => rule.targetType === "question" && keyById.has(rule.targetId))
      .map((rule) => ({
        targetKey: keyById.get(rule.targetId) || "",
        action: rule.action === "hide" ? "hide" as const : "show" as const,
        matchType: rule.matchType === "any" ? "any" as const : "all" as const,
        conditions: rule.conditions
          .filter((condition) => keyById.has(condition.sourceQuestionId))
          .map((condition) => ({
            sourceKey: keyById.get(condition.sourceQuestionId) || "",
            operator: condition.operator,
            value: condition.valueJson,
          })),
      })),
    reminder: form.reminderSetting
      ? {
          enabled: form.reminderSetting.enabled,
          firstAfterDays: form.reminderSetting.firstAfterDays,
          repeatEveryDays: form.reminderSetting.repeatEveryDays,
          maxCount: form.reminderSetting.maxCount,
          subject: form.reminderSetting.subject,
          body: form.reminderSetting.body,
        }
      : undefined,
  };
}
