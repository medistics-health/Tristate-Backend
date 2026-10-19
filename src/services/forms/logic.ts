export type LogicAction = "show" | "hide";
export type LogicMatch = "all" | "any";

export type LogicConditionInput = {
  sourceQuestionId: string;
  operator: string;
  value?: unknown;
};

export type LogicRuleInput = {
  targetType: "question" | "section";
  targetId: string;
  action: LogicAction;
  matchType: LogicMatch;
  skipToSectionId?: string | null;
  conditions: LogicConditionInput[];
};

export type OrderedItem = {
  id: string;
  kind: "section" | "question";
  sectionId?: string;
};

const CHOICE_OPS = new Set(["is", "is_not", "is_any_of"]);
const MULTI_OPS = new Set([
  "contains",
  "does_not_contain",
  "contains_any_of",
  "contains_all_of",
]);
const TEXT_OPS = new Set([
  "equals",
  "does_not_equal",
  "contains",
  "is_empty",
  "is_not_empty",
]);
const NUMBER_OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "between"]);
const DATE_OPS = new Set(["is_on", "is_before", "is_after", "is_between"]);
const ANSWERED_OPS = new Set(["is_answered", "is_not_answered"]);

const OPERATORS_BY_TYPE: Record<string, Set<string>> = {
  SINGLE_CHOICE: CHOICE_OPS,
  DROPDOWN: CHOICE_OPS,
  YES_NO: CHOICE_OPS,
  IMAGE_CHOICE: new Set([...CHOICE_OPS, ...MULTI_OPS, ...ANSWERED_OPS]),
  MULTIPLE_CHOICE: MULTI_OPS,
  SHORT_TEXT: TEXT_OPS,
  EMAIL: TEXT_OPS,
  PHONE: TEXT_OPS,
  NUMBER: NUMBER_OPS,
  PRICE: NUMBER_OPS,
  FEES: NUMBER_OPS,
  RATING: NUMBER_OPS,
  DATE: DATE_OPS,
  IMAGE_UPLOAD: ANSWERED_OPS,
  LONG_TEXT: new Set([...TEXT_OPS, ...ANSWERED_OPS]),
  CONTENT: new Set(),
};

export function operatorsForType(type: string) {
  return OPERATORS_BY_TYPE[type] || ANSWERED_OPS;
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function asNumber(value: unknown): number | null {
  if (value && typeof value === "object" && "amount" in value) {
    return asNumber((value as { amount: unknown }).amount);
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function asDate(value: unknown): number | null {
  if (!value) return null;
  const time = new Date(String(value)).getTime();
  return Number.isNaN(time) ? null : time;
}

function isAnswered(value: unknown) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.files)) return record.files.length > 0;
    if ("amount" in record) return asNumber(record.amount) !== null;
  }
  return true;
}

export function evaluateCondition(
  operator: string,
  answer: unknown,
  expected: unknown,
): boolean {
  const text = answer === undefined || answer === null ? "" : String(answer);
  const expectedText = expected === undefined || expected === null ? "" : String(expected);
  const answerList = asArray(
    answer && typeof answer === "object" && "selected" in (answer as object)
      ? (answer as { selected: unknown }).selected
      : answer,
  );
  const expectedList = asArray(expected);

  switch (operator) {
    case "is":
    case "equals":
    case "eq":
      if (asNumber(answer) !== null && asNumber(expected) !== null) {
        return asNumber(answer) === asNumber(expected);
      }
      return text.toLowerCase() === expectedText.toLowerCase();
    case "is_not":
    case "does_not_equal":
    case "neq":
      if (asNumber(answer) !== null && asNumber(expected) !== null) {
        return asNumber(answer) !== asNumber(expected);
      }
      return text.toLowerCase() !== expectedText.toLowerCase();
    case "is_any_of":
      return expectedList.map((item) => item.toLowerCase()).includes(text.toLowerCase());
    case "contains":
      if (Array.isArray(answer) || (answer && typeof answer === "object" && "selected" in (answer as object))) {
        return answerList.map((item) => item.toLowerCase()).includes(expectedText.toLowerCase());
      }
      return text.toLowerCase().includes(expectedText.toLowerCase());
    case "does_not_contain":
      return !answerList.map((item) => item.toLowerCase()).includes(expectedText.toLowerCase());
    case "contains_any_of":
      return expectedList.some((item) =>
        answerList.map((entry) => entry.toLowerCase()).includes(item.toLowerCase()),
      );
    case "contains_all_of":
      return expectedList.every((item) =>
        answerList.map((entry) => entry.toLowerCase()).includes(item.toLowerCase()),
      );
    case "is_empty":
      return !isAnswered(answer);
    case "is_not_empty":
    case "is_answered":
      return isAnswered(answer);
    case "is_not_answered":
      return !isAnswered(answer);
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "between": {
      const left = asNumber(answer);
      if (left === null) return false;
      if (operator === "between") {
        const range = asArray(expected).map((item) => Number(item));
        if (range.length < 2 || range.some((item) => Number.isNaN(item))) return false;
        return left >= range[0] && left <= range[1];
      }
      const right = asNumber(expected);
      if (right === null) return false;
      if (operator === "gt") return left > right;
      if (operator === "gte") return left >= right;
      if (operator === "lt") return left < right;
      return left <= right;
    }
    case "is_on":
    case "is_before":
    case "is_after":
    case "is_between": {
      const left = asDate(answer);
      if (left === null) return false;
      if (operator === "is_between") {
        const range = asArray(expected);
        const start = asDate(range[0]);
        const end = asDate(range[1]);
        if (start === null || end === null) return false;
        return left >= start && left <= end;
      }
      const right = asDate(expected);
      if (right === null) return false;
      if (operator === "is_on") {
        const a = new Date(left);
        const b = new Date(right);
        return (
          a.getUTCFullYear() === b.getUTCFullYear() &&
          a.getUTCMonth() === b.getUTCMonth() &&
          a.getUTCDate() === b.getUTCDate()
        );
      }
      if (operator === "is_before") return left < right;
      return left > right;
    }
    default:
      return false;
  }
}

export function isRuleMet(
  rule: Pick<LogicRuleInput, "matchType" | "conditions">,
  answers: Record<string, unknown>,
) {
  if (!rule.conditions.length) return false;
  const results = rule.conditions.map((condition) =>
    evaluateCondition(
      condition.operator,
      answers[condition.sourceQuestionId],
      condition.value,
    ),
  );
  return rule.matchType === "any" ? results.some(Boolean) : results.every(Boolean);
}

export function isTargetVisible(
  rule: Pick<LogicRuleInput, "action" | "matchType" | "conditions"> | undefined,
  answers: Record<string, unknown>,
) {
  if (!rule) return true;
  const met = isRuleMet(rule, answers);
  return rule.action === "show" ? met : !met;
}

export function questionOrderIndex(items: OrderedItem[]) {
  const index = new Map<string, number>();
  items.forEach((item, position) => {
    if (item.kind === "question") index.set(item.id, position);
  });
  return index;
}

export function validateLogicRules(params: {
  rules: LogicRuleInput[];
  questions: Array<{ id: string; type: string; sectionId: string }>;
  sections: Array<{ id: string }>;
  items: OrderedItem[];
}) {
  const errors: string[] = [];
  const questionIds = new Set(params.questions.map((question) => question.id));
  const sectionIds = new Set(params.sections.map((section) => section.id));
  const typeById = new Map(params.questions.map((question) => [question.id, question.type]));
  const order = questionOrderIndex(params.items);
  const sectionOrder = new Map<string, number>();
  params.items.forEach((item, position) => {
    if (item.kind === "section") sectionOrder.set(item.id, position);
  });
  const targets = new Set<string>();

  for (const rule of params.rules) {
    const targetKey = `${rule.targetType}:${rule.targetId}`;
    if (targets.has(targetKey)) {
      errors.push(`Only one logic rule is allowed per target (${rule.targetId}).`);
    }
    targets.add(targetKey);

    if (rule.targetType === "question" && !questionIds.has(rule.targetId)) {
      errors.push("A logic rule targets a question that does not exist.");
    }
    if (rule.targetType === "section" && !sectionIds.has(rule.targetId)) {
      errors.push("A logic rule targets a section that does not exist.");
    }
    if (rule.action !== "show" && rule.action !== "hide") {
      errors.push("Logic action must be show or hide.");
    }
    if (rule.matchType !== "all" && rule.matchType !== "any") {
      errors.push("Logic match must be all or any.");
    }
    if (!rule.conditions.length || rule.conditions.length > 10) {
      errors.push("Each logic rule needs between 1 and 10 conditions.");
    }
    if (rule.skipToSectionId && !sectionIds.has(rule.skipToSectionId)) {
      errors.push("Skip-to section does not exist.");
    }

    const targetPosition =
      rule.targetType === "question"
        ? order.get(rule.targetId)
        : sectionOrder.get(rule.targetId);

    for (const condition of rule.conditions) {
      if (!questionIds.has(condition.sourceQuestionId)) {
        errors.push("A logic condition references a missing question.");
        continue;
      }
      const sourcePosition = order.get(condition.sourceQuestionId);
      if (
        sourcePosition === undefined ||
        targetPosition === undefined ||
        sourcePosition >= targetPosition
      ) {
        errors.push("Logic can only depend on an earlier question.");
      }
      const allowed = operatorsForType(typeById.get(condition.sourceQuestionId) || "");
      if (!allowed.has(condition.operator) && !ANSWERED_OPS.has(condition.operator)) {
        errors.push(
          `Operator "${condition.operator}" is not valid for this question type.`,
        );
      }
    }
  }

  return errors;
}

export function plainEnglishRule(
  rule: LogicRuleInput,
  labels: Map<string, string>,
) {
  const joiner = rule.matchType === "any" ? " or " : " and ";
  const parts = rule.conditions.map((condition) => {
    const label = labels.get(condition.sourceQuestionId) || "a question";
    const value = Array.isArray(condition.value)
      ? condition.value.join(", ")
      : condition.value === undefined || condition.value === null
        ? ""
        : String(condition.value);
    return `${label} ${condition.operator.replace(/_/g, " ")}${value ? ` ${value}` : ""}`;
  });
  const verb = rule.action === "show" ? "Shown if" : "Hidden if";
  return `${verb} ${parts.join(joiner)}`;
}
