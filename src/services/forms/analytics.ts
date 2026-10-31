import { FormResponseStatus } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { QuestionShape } from "./answers";

type Filters = {
  practiceIds?: string[];
  from?: Date | null;
  to?: Date | null;
  statuses?: string[];
  questionId?: string;
  operator?: string;
  value?: unknown;
};

function responseWhere(formId: string, filters: Filters) {
  const where: Record<string, unknown> = {
    formId,
    status: FormResponseStatus.SUBMITTED,
  };
  if (filters.practiceIds?.length) where.practiceId = { in: filters.practiceIds };
  if (filters.from || filters.to) {
    where.submittedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  return where;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function matchesAnswerFilter(
  answers: Array<{ questionId: string; valueText: string | null; valueNumber: unknown; valueJson: unknown }>,
  filters: Filters,
) {
  if (!filters.questionId || !filters.operator) return true;
  const answer = answers.find((item) => item.questionId === filters.questionId);
  const numberValue = answer?.valueNumber === null || answer?.valueNumber === undefined
    ? null
    : Number(answer.valueNumber);
  const text = answer?.valueText || "";
  const json = answer?.valueJson;
  const op = filters.operator;
  const expected = filters.value;
  if (op === "is" || op === "equals") {
    return text === String(expected) || JSON.stringify(json)?.includes(String(expected));
  }
  if (op === "gte" && numberValue !== null) return numberValue >= Number(expected);
  if (op === "lte" && numberValue !== null) return numberValue <= Number(expected);
  if (op === "gt" && numberValue !== null) return numberValue > Number(expected);
  if (op === "lt" && numberValue !== null) return numberValue < Number(expected);
  return true;
}

export async function loadSubmitted(formId: string, filters: Filters) {
  const responses = await prisma.formResponse.findMany({
    where: responseWhere(formId, filters),
    include: {
      answers: true,
      recipient: {
        select: {
          id: true,
          displayName: true,
          email: true,
          practiceName: true,
          practiceId: true,
          status: true,
        },
      },
    },
    orderBy: { submittedAt: "asc" },
  });
  return responses.filter((response) => matchesAnswerFilter(response.answers, filters));
}

export async function dashboard(formId: string, filters: Filters, anonymous: boolean, minGroup: number) {
  const recipients = await prisma.formRecipient.findMany({ where: { formId } });
  const practiceFilter = new Set(filters.practiceIds || []);
  const inScope = recipients.filter((recipient) => {
    if (recipient.status === "REMOVED") return false;
    if (practiceFilter.size && !practiceFilter.has(recipient.practiceId || "")) return false;
    return true;
  });
  const sent = inScope.filter((recipient) => !["BOUNCED", "FAILED", "PENDING"].includes(recipient.status));
  const completed = inScope.filter((recipient) => recipient.status === "COMPLETED");
  const inProgress = inScope.filter((recipient) => recipient.status === "IN_PROGRESS");
  const notOpened = inScope.filter((recipient) => recipient.status === "NOT_OPENED");
  const bounced = inScope.filter((recipient) => recipient.status === "BOUNCED" || recipient.deliveryStatus === "BOUNCED");
  const totalSent = sent.length;
  const completionRate = totalSent ? Math.round((completed.length / totalSent) * 1000) / 10 : 0;
  const dropOffDenom = inProgress.length + completed.length;
  const dropOffRate = dropOffDenom ? Math.round((inProgress.length / dropOffDenom) * 1000) / 10 : 0;

  const responses = await loadSubmitted(formId, filters);
  const byPractice = new Map<string, { practiceId: string | null; practiceName: string; sent: number; completed: number }>();
  for (const recipient of inScope) {
    const key = recipient.practiceId || "none";
    const row = byPractice.get(key) || {
      practiceId: recipient.practiceId,
      practiceName: recipient.practiceName || "No practice",
      sent: 0,
      completed: 0,
    };
    if (!["BOUNCED", "FAILED", "PENDING"].includes(recipient.status)) row.sent += 1;
    if (recipient.status === "COMPLETED") row.completed += 1;
    byPractice.set(key, row);
  }

  const practices = [...byPractice.values()].map((row) => {
    const hide = anonymous && row.completed < minGroup;
    return {
      practiceId: hide ? null : row.practiceId,
      practiceName: hide ? "Suppressed (fewer than minimum group size)" : row.practiceName,
      sent: hide ? null : row.sent,
      completed: hide ? null : row.completed,
      completionRate: hide || !row.sent ? null : Math.round((row.completed / row.sent) * 1000) / 10,
      suppressed: hide,
    };
  });

  return {
    totalSent,
    responded: completed.length,
    completionRate,
    inProgress: inProgress.length,
    notOpened: notOpened.length,
    bounced: bounced.length,
    dropOffRate,
    responseCount: responses.length,
    practices,
  };
}

export function questionSummary(question: QuestionShape, responses: Awaited<ReturnType<typeof loadSubmitted>>) {
  const answered = responses.filter((response) =>
    response.answers.some((answer) => answer.questionId === question.id),
  );
  const skipped = responses.length - answered.length;
  const n = answered.length;
  const base = { questionId: question.id, key: question.key, type: question.type, label: question.label, answered: n, skipped };

  if (["SINGLE_CHOICE", "DROPDOWN", "YES_NO", "IMAGE_CHOICE"].includes(question.type)) {
    const counts = new Map<string, number>();
    for (const option of question.options) counts.set(option.id, 0);
    for (const response of answered) {
      const answer = response.answers.find((item) => item.questionId === question.id);
      const json = answer?.valueJson as { optionId?: string; optionIds?: string[] } | null;
      const text = answer?.valueText;
      if (question.type === "YES_NO") {
        const key = text === "Yes" ? "yes" : "no";
        counts.set(key, (counts.get(key) || 0) + 1);
      } else if (json?.optionIds) {
        for (const id of json.optionIds) counts.set(id, (counts.get(id) || 0) + 1);
      } else if (json?.optionId) {
        counts.set(json.optionId, (counts.get(json.optionId) || 0) + 1);
      }
    }
    const options = question.type === "YES_NO"
      ? ["yes", "no"].map((id) => ({
          id,
          label: id === "yes" ? "Yes" : "No",
          count: counts.get(id) || 0,
          percent: n ? Math.round(((counts.get(id) || 0) / n) * 1000) / 10 : 0,
        }))
      : question.options.map((option) => ({
          id: option.id,
          label: option.label,
          count: counts.get(option.id) || 0,
          percent: n ? Math.round(((counts.get(option.id) || 0) / n) * 1000) / 10 : 0,
        }));
    return {
      ...base,
      chart: question.type === "MULTIPLE_CHOICE" || (question.type === "DROPDOWN" && question.config?.multi) ? "bar" : "pie",
      options,
    };
  }

  if (question.type === "MULTIPLE_CHOICE") {
    const counts = new Map<string, number>();
    for (const option of question.options) counts.set(option.id, 0);
    for (const response of answered) {
      const answer = response.answers.find((item) => item.questionId === question.id);
      const ids = ((answer?.valueJson as { optionIds?: string[] } | null)?.optionIds) || [];
      for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return {
      ...base,
      chart: "bar",
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        count: counts.get(option.id) || 0,
        percent: n ? Math.round(((counts.get(option.id) || 0) / n) * 1000) / 10 : 0,
      })),
    };
  }

  if (["RATING", "NUMBER", "PRICE", "FEES"].includes(question.type)) {
    const values = answered
      .map((response) => response.answers.find((item) => item.questionId === question.id)?.valueNumber)
      .filter((value): value is NonNullable<typeof value> => value !== null && value !== undefined)
      .map((value) => Number(value));
    const sum = values.reduce((total, value) => total + value, 0);
    const distribution = new Map<string, number>();
    for (const value of values) {
      const key = String(value);
      distribution.set(key, (distribution.get(key) || 0) + 1);
    }
    return {
      ...base,
      chart: question.type === "RATING" ? "column" : "histogram",
      sum: Math.round(sum * 100) / 100,
      average: values.length ? Math.round((sum / values.length) * 100) / 100 : null,
      median: median(values),
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      distribution: [...distribution.entries()].map(([value, count]) => ({
        value,
        count,
        percent: n ? Math.round((count / n) * 1000) / 10 : 0,
      })),
    };
  }

  if (question.type === "DATE") {
    const dates = answered
      .map((response) => response.answers.find((item) => item.questionId === question.id)?.valueDate)
      .filter((value): value is Date => !!value);
    const byMonth = new Map<string, number>();
    for (const date of dates) {
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) || 0) + 1);
    }
    return {
      ...base,
      chart: "column",
      earliest: dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))).toISOString() : null,
      latest: dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString() : null,
      distribution: [...byMonth.entries()].map(([month, count]) => ({ month, count })),
    };
  }

  if (question.type === "IMAGE_UPLOAD" || question.type === "IMAGE_CHOICE") {
    return { ...base, chart: "gallery" };
  }

  const texts = answered
    .map((response) => response.answers.find((item) => item.questionId === question.id)?.valueText || "")
    .filter(Boolean);
  return { ...base, chart: "list", answers: texts };
}

export function trends(
  responses: Array<{ submittedAt: Date | null; practiceId: string | null }>,
  bucket: "day" | "week" | "month",
) {
  const buckets = new Map<string, { period: string; count: number; byPractice: Record<string, number> }>();
  for (const response of responses) {
    if (!response.submittedAt) continue;
    const date = response.submittedAt;
    let period = date.toISOString().slice(0, 10);
    if (bucket === "month") period = date.toISOString().slice(0, 7);
    if (bucket === "week") {
      const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const day = copy.getUTCDay() || 7;
      copy.setUTCDate(copy.getUTCDate() - day + 1);
      period = copy.toISOString().slice(0, 10);
    }
    const row = buckets.get(period) || { period, count: 0, byPractice: {} };
    row.count += 1;
    const practiceKey = response.practiceId || "none";
    row.byPractice[practiceKey] = (row.byPractice[practiceKey] || 0) + 1;
    buckets.set(period, row);
  }
  const series = [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
  let running = 0;
  return series.map((row) => {
    running += row.count;
    return { ...row, cumulative: running };
  });
}
