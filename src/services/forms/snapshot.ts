import type { LoadedForm } from "./shared";
import { sanitizeRichText } from "./sanitize";
import { plainEnglishRule, type LogicRuleInput } from "./logic";

export function toRules(form: LoadedForm): LogicRuleInput[] {
  return form.logicRules.map((rule) => ({
    targetType: rule.targetType === "section" ? "section" : "question",
    targetId: rule.targetId,
    action: rule.action === "hide" ? "hide" : "show",
    matchType: rule.matchType === "any" ? "any" : "all",
    skipToSectionId: rule.skipToSectionId,
    conditions: rule.conditions.map((condition) => ({
      sourceQuestionId: condition.sourceQuestionId,
      operator: condition.operator,
      value: condition.valueJson,
    })),
  }));
}

export function buildSnapshot(form: LoadedForm) {
  const labels = new Map(form.questions.map((question) => [question.id, question.label]));
  const rules = toRules(form);
  return {
    id: form.id,
    refCode: form.refCode,
    versionNo: form.versionNo,
    title: form.title,
    displayTitle: form.displayTitle?.trim() || "",
    description: sanitizeRichText(form.description),
    instructions: sanitizeRichText(form.instructions),
    privacyNotice: sanitizeRichText(form.privacyNotice),
    displayMode: form.displayMode,
    showProgressBar: form.showProgressBar,
    showQuestionNumbers: form.showQuestionNumbers,
    allowSaveResume: form.allowSaveResume,
    confirmationMessage: sanitizeRichText(
      form.confirmationMessage || "Thank you. Your response has been recorded.",
    ),
    redirectUrl: form.redirectUrl,
    responseMode: form.responseMode,
    allowMultipleResponses: form.allowMultipleResponses,
    allowEditUntilClose: form.allowEditUntilClose,
    closeAt: form.closeAt,
    sections: form.sections.filter((section) => form.questions.some((question) => question.sectionId === section.id)).map((section) => ({
      id: section.id,
      title: section.title,
      description: sanitizeRichText(section.description),
      orderIndex: section.orderIndex,
    })),
    questions: form.questions.map((question) => ({
      id: question.id,
      sectionId: question.sectionId,
      key: question.key,
      type: question.type,
      label: question.label,
      helpText: question.helpText,
      isRequired: question.isRequired,
      orderIndex: question.orderIndex,
      config: question.configJson,
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        value: option.value,
        imageRef: option.imageRef,
        isOther: option.isOther,
        orderIndex: option.orderIndex,
      })),
    })),
    logic: rules.map((rule) => ({
      ...rule,
      summary: plainEnglishRule(rule, labels),
    })),
  };
}

export type FormSnapshot = ReturnType<typeof buildSnapshot>;

export function snapshotOf(form: LoadedForm): FormSnapshot {
  const snapshot = form.publishedSnapshot && typeof form.publishedSnapshot === "object"
    ? form.publishedSnapshot as FormSnapshot
    : buildSnapshot(form);
  const used = new Set((snapshot.questions || []).map((question) => question.sectionId));
  return { ...snapshot, sections: (snapshot.sections || []).filter((section) => used.has(section.id)) };
}
