import { isTargetVisible, type LogicRuleInput } from "./logic";

export type QuestionShape = {
  id: string;
  key: string;
  type: string;
  label: string;
  isRequired: boolean;
  sectionId: string;
  config: Record<string, unknown>;
  options: Array<{ id: string; label: string; value: string; isOther: boolean }>;
};

export type StoredAnswer = {
  valueText?: string | null;
  valueNumber?: number | null;
  valueDate?: Date | null;
  valueJson?: unknown;
  fileRefs?: unknown;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\d\s.-]{7,20}$/;
const URL_RE = /^https?:\/\/\S+$/i;

export function answerMap(answers: Record<string, unknown>) {
  return answers || {};
}

export function visibleQuestionIds(
  questions: QuestionShape[],
  sections: Array<{ id: string }>,
  rules: LogicRuleInput[],
  answers: Record<string, unknown>,
) {
  const ruleByTarget = new Map(
    rules.map((rule) => [`${rule.targetType}:${rule.targetId}`, rule]),
  );
  const visibleSections = new Set(
    sections
      .filter((section) =>
        isTargetVisible(ruleByTarget.get(`section:${section.id}`), answers),
      )
      .map((section) => section.id),
  );

  return new Set(
    questions
      .filter((question) => visibleSections.has(question.sectionId))
      .filter((question) =>
        isTargetVisible(ruleByTarget.get(`question:${question.id}`), answers),
      )
      .filter((question) => question.type !== "CONTENT")
      .map((question) => question.id),
  );
}

function optionIds(question: QuestionShape) {
  return new Set(question.options.map((option) => option.id));
}

export function normalizeStored(question: QuestionShape, raw: unknown): StoredAnswer | { error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return {};
  }

  switch (question.type) {
    case "SINGLE_CHOICE":
    case "DROPDOWN":
    case "IMAGE_CHOICE": {
      const selected = typeof raw === "object" && raw && "optionId" in raw
        ? String((raw as { optionId: unknown }).optionId)
        : String(raw);
      const otherText =
        typeof raw === "object" && raw && "otherText" in raw
          ? String((raw as { otherText: unknown }).otherText || "")
          : "";
      if (question.type !== "IMAGE_CHOICE" || question.config.selectMode !== "multi") {
        if (!optionIds(question).has(selected)) {
          return { error: `${question.label} has an invalid option.` };
        }
        return { valueJson: { optionId: selected, otherText } };
      }
      const selectedIds = Array.isArray(raw) ? raw.map(String) : [selected];
      if (selectedIds.some((id) => !optionIds(question).has(id))) {
        return { error: `${question.label} has an invalid option.` };
      }
      return { valueJson: { optionIds: selectedIds } };
    }
    case "MULTIPLE_CHOICE": {
      const record = (raw && typeof raw === "object" ? raw : {}) as {
        optionIds?: unknown;
        otherText?: unknown;
      };
      const ids = Array.isArray(raw)
        ? raw.map(String)
        : Array.isArray(record.optionIds)
          ? record.optionIds.map(String)
          : [];
      if (ids.some((id) => !optionIds(question).has(id))) {
        return { error: `${question.label} has an invalid option.` };
      }
      return {
        valueJson: {
          optionIds: ids,
          otherText: record.otherText ? String(record.otherText) : "",
        },
      };
    }
    case "YES_NO": {
      const value = String(raw).toLowerCase();
      if (!["yes", "no", "true", "false"].includes(value)) {
        return { error: `${question.label} must be yes or no.` };
      }
      const bool = value === "yes" || value === "true";
      return { valueJson: bool, valueText: bool ? "Yes" : "No" };
    }
    case "SHORT_TEXT":
    case "LONG_TEXT":
    case "EMAIL":
    case "PHONE": {
      const text = String(raw);
      const max = Number(question.config.maxLength || (question.type === "LONG_TEXT" ? 5000 : 255));
      if (text.length > max) {
        return { error: `${question.label} is longer than ${max} characters.` };
      }
      return { valueText: text };
    }
    case "RATING":
    case "NUMBER":
    case "PRICE": {
      const amount = typeof raw === "object" && raw && "amount" in raw
        ? Number((raw as { amount: unknown }).amount)
        : Number(raw);
      if (!Number.isFinite(amount)) {
        return { error: `${question.label} must be a number.` };
      }
      return { valueNumber: amount, valueJson: typeof raw === "object" ? raw : { amount } };
    }
    case "FEES": {
      const record = (raw && typeof raw === "object" ? raw : { amount: raw }) as {
        amount?: unknown;
        frequency?: unknown;
        currency?: unknown;
      };
      const amount = Number(record.amount);
      if (!Number.isFinite(amount)) {
        return { error: `${question.label} must be a number.` };
      }
      return {
        valueNumber: amount,
        valueJson: {
          amount,
          frequency: record.frequency ? String(record.frequency) : null,
          currency: record.currency || question.config.currency || null,
        },
      };
    }
    case "DATE": {
      const date = new Date(String(raw));
      if (Number.isNaN(date.getTime())) {
        return { error: `${question.label} is not a valid date.` };
      }
      return { valueDate: date, valueText: date.toISOString() };
    }
    case "IMAGE_UPLOAD": {
      const files = Array.isArray(raw) ? raw : (raw as { files?: unknown[] })?.files;
      if (!Array.isArray(files)) {
        return { error: `${question.label} needs a file list.` };
      }
      return { fileRefs: files, valueJson: { files } };
    }
    default:
      return { valueJson: raw };
  }
}

export function validateAnswer(question: QuestionShape, stored: StoredAnswer, required: boolean) {
  const errors: string[] = [];
  const empty =
    (stored.valueText === undefined || stored.valueText === null || stored.valueText === "") &&
    (stored.valueNumber === undefined || stored.valueNumber === null) &&
    !stored.valueDate &&
    (stored.valueJson === undefined || stored.valueJson === null || stored.valueJson === "") &&
    !stored.fileRefs;

  if (required && empty) {
    errors.push(`${question.label} is required.`);
    return errors;
  }
  if (empty) return errors;

  const config = question.config || {};

  if (question.type === "SHORT_TEXT" || question.type === "EMAIL" || question.type === "PHONE") {
    const text = stored.valueText || "";
    const format = String(config.format || (question.type === "EMAIL" ? "email" : question.type === "PHONE" ? "phone" : "none"));
    if (format === "email" && !EMAIL_RE.test(text)) errors.push(`${question.label} must be an email.`);
    if (format === "phone" && !PHONE_RE.test(text)) errors.push(`${question.label} must be a phone number.`);
    if (format === "url" && !URL_RE.test(text)) errors.push(`${question.label} must be a URL.`);
    if (format === "regex" && config.regex) {
      try {
        const pattern = new RegExp(String(config.regex));
        if (!pattern.test(text)) errors.push(`${question.label} is not in the expected format.`);
      } catch {
        errors.push(`${question.label} has an invalid format rule.`);
      }
    }
  }

  if (question.type === "MULTIPLE_CHOICE" || (question.type === "IMAGE_CHOICE" && config.selectMode === "multi")) {
    const ids = ((stored.valueJson as { optionIds?: string[] })?.optionIds) || [];
    const min = config.minSelections !== undefined ? Number(config.minSelections) : undefined;
    const max = config.maxSelections !== undefined ? Number(config.maxSelections) : undefined;
    if (min !== undefined && ids.length < min) errors.push(`${question.label} needs at least ${min} selections.`);
    if (max !== undefined && ids.length > max) errors.push(`${question.label} allows at most ${max} selections.`);
  }

  if (["NUMBER", "PRICE", "FEES", "RATING"].includes(question.type) && stored.valueNumber !== null && stored.valueNumber !== undefined) {
    const value = Number(stored.valueNumber);
    if (question.type === "NUMBER" && config.integer && !Number.isInteger(value)) {
      errors.push(`${question.label} must be a whole number.`);
    }
    if (config.min !== undefined && value < Number(config.min)) {
      errors.push(`${question.label} must be at least ${config.min}.`);
    }
    if (config.max !== undefined && value > Number(config.max)) {
      errors.push(`${question.label} must be at most ${config.max}.`);
    }
    if (question.type === "PRICE" && value < 0 && config.min === undefined) {
      errors.push(`${question.label} cannot be negative.`);
    }
    if (question.type === "RATING") {
      const scale = Number(config.scale || 5);
      if (value < 1 || value > scale) errors.push(`${question.label} must be between 1 and ${scale}.`);
    }
    if (question.type === "FEES" && config.requireFrequency) {
      const frequency = (stored.valueJson as { frequency?: string } | null)?.frequency;
      if (!frequency) errors.push(`${question.label} needs a frequency.`);
    }
  }

  if (question.type === "DATE" && stored.valueDate) {
    const time = stored.valueDate.getTime();
    if (config.minDate && time < new Date(String(config.minDate)).getTime()) {
      errors.push(`${question.label} is before the earliest allowed date.`);
    }
    if (config.maxDate && time > new Date(String(config.maxDate)).getTime()) {
      errors.push(`${question.label} is after the latest allowed date.`);
    }
  }

  if (question.type === "IMAGE_UPLOAD") {
    const files = Array.isArray(stored.fileRefs) ? stored.fileRefs : [];
    const maxFiles = Number(config.maxFiles || 1);
    if (files.length > maxFiles) errors.push(`${question.label} allows at most ${maxFiles} file(s).`);
  }

  return errors;
}

export function displayValue(question: QuestionShape, stored: StoredAnswer) {
  if (stored.valueText) return stored.valueText;
  if (stored.valueNumber !== null && stored.valueNumber !== undefined) {
    const json = stored.valueJson as { frequency?: string; currency?: string } | null;
    if (question.type === "FEES") {
      return [stored.valueNumber, json?.currency, json?.frequency].filter(Boolean).join(" ");
    }
    return String(stored.valueNumber);
  }
  if (stored.valueDate) return stored.valueDate.toISOString();
  const json = stored.valueJson as { optionId?: string; optionIds?: string[]; otherText?: string } | null;
  if (json?.optionId) {
    const option = question.options.find((item) => item.id === json.optionId);
    return [option?.label || json.optionId, json.otherText].filter(Boolean).join(": ");
  }
  if (json?.optionIds) {
    const labels = json.optionIds.map(
      (id) => question.options.find((item) => item.id === id)?.label || id,
    );
    return [...labels, json.otherText].filter(Boolean).join("; ");
  }
  if (typeof stored.valueJson === "boolean") return stored.valueJson ? "Yes" : "No";
  if (stored.fileRefs) return "file";
  return "";
}

export function spreadsheetSafe(value: string) {
  if (/^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}
