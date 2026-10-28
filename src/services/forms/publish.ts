import { FormStatus } from "../../../generated/prisma/client";
import type { LoadedForm } from "./shared";
import { validateLogicRules, type LogicRuleInput } from "./logic";
import { toRules } from "./snapshot";

const CHOICE_TYPES = new Set(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "DROPDOWN", "IMAGE_CHOICE"]);

export function publishErrors(form: LoadedForm, recipientCount: number) {
  const errors: Array<{ message: string; target?: string }> = [];
  if (!form.title?.trim()) errors.push({ message: "Title is required.", target: "title" });
  if (!form.questions.length) errors.push({ message: "Add at least one question." });

  for (const question of form.questions) {
    if (!question.label?.trim()) {
      errors.push({ message: "A question is missing a label.", target: question.id });
    }
    if (CHOICE_TYPES.has(question.type) && question.options.filter((option) => !option.isOther).length < 2) {
      errors.push({
        message: `"${question.label || "Choice question"}" needs at least two options.`,
        target: question.id,
      });
    }
    if (question.options.some((option) => !option.label?.trim())) {
      errors.push({ message: "An option is missing a label.", target: question.id });
    }
  }

  const rules: LogicRuleInput[] = toRules(form);
  const items = [
    ...form.sections.map((section) => ({ id: section.id, kind: "section" as const })),
    ...form.questions.map((question) => ({
      id: question.id,
      kind: "question" as const,
      sectionId: question.sectionId,
    })),
  ];
  // Order sections, and questions inside each section, the way respondents see them.
  const ordered = form.sections.flatMap((section) => [
    { id: section.id, kind: "section" as const },
    ...form.questions
      .filter((question) => question.sectionId === section.id)
      .map((question) => ({ id: question.id, kind: "question" as const, sectionId: section.id })),
  ]);
  for (const message of validateLogicRules({
    rules,
    questions: form.questions.map((question) => ({
      id: question.id,
      type: question.type,
      sectionId: question.sectionId,
    })),
    sections: form.sections.map((section) => ({ id: section.id })),
    items: ordered.length ? ordered : items,
  })) {
    errors.push({ message });
  }

  if (!recipientCount && !form.publicLinkEnabled) {
    errors.push({ message: "Add recipients or enable the public link before publishing." });
  }
  if (form.closeAt && form.closeAt.getTime() <= Date.now()) {
    errors.push({ message: "Closing date must be in the future.", target: "closeAt" });
  }
  if (form.sendAt && form.closeAt && form.closeAt <= form.sendAt) {
    errors.push({ message: "Closing date must be after the send time." });
  }
  if (form.sendAt && form.sendAt.getTime() < Date.now() - 60_000) {
    errors.push({ message: "Send time cannot be in the past. Use send now instead." });
  }
  if (!form.inviteBody?.includes("{{form_link}}")) {
    errors.push({ message: "The invitation must include {{form_link}}.", target: "inviteBody" });
  }
  return errors;
}

export function structuralLockMessage() {
  return {
    message: "This form already has responses, so its structure is locked.",
    allowed: [
      "Fix typos in labels, help text, descriptions and option text",
      "Change the confirmation message",
      "Add recipients",
      "Edit reminders",
      "Extend the closing date",
      "Add a new optional question at the end of the last section",
      "Create a new version",
    ],
    locked: [
      "Question type",
      "Deleting a question or section",
      "Deleting or re-meaning an option",
      "Anonymous or identified mode",
      "One-response setting",
    ],
  };
}

export function isOpenForResponses(form: {
  status: FormStatus;
  sendAt: Date | null;
  closeAt: Date | null;
}) {
  if (form.status !== FormStatus.PUBLISHED) return false;
  const now = Date.now();
  if (form.sendAt && form.sendAt.getTime() > now) return false;
  if (form.closeAt && form.closeAt.getTime() <= now) return false;
  return true;
}

export function publicState(form: {
  status: FormStatus;
  sendAt: Date | null;
  closeAt: Date | null;
  deletedAt?: Date | null;
}) {
  if (form.deletedAt) return "invalid";
  if (form.status === FormStatus.DRAFT) return "not_open";
  if (form.status === FormStatus.ARCHIVED || form.status === FormStatus.CLOSED) return "closed";
  if (form.sendAt && form.sendAt.getTime() > Date.now()) return "not_open";
  if (form.closeAt && form.closeAt.getTime() <= Date.now()) return "closed";
  if (form.status !== FormStatus.PUBLISHED) return "closed";
  return "open";
}
