import { prisma } from "../../lib/prisma";
import { canReadAllForms, isAdmin } from "./access";

export const formInclude = {
  owner: {
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  },
  sections: { where: { deletedAt: null }, orderBy: { orderIndex: "asc" as const } },
  questions: {
    where: { deletedAt: null },
    orderBy: { orderIndex: "asc" as const },
    include: {
      options: { where: { deletedAt: null }, orderBy: { orderIndex: "asc" as const } },
    },
  },
  logicRules: { include: { conditions: { orderBy: { orderIndex: "asc" as const } } } },
  reminderSetting: true,
};

export async function loadForm(id: string) {
  return prisma.form.findFirst({
    where: { id, deletedAt: null },
    include: formInclude,
  });
}

export type LoadedForm = NonNullable<Awaited<ReturnType<typeof loadForm>>>;

export async function responseCount(formId: string) {
  return prisma.formResponse.count({ where: { formId } });
}

export function ownerWhere(role: string | undefined, userId: string) {
  if (canReadAllForms(role)) return {};
  return { ownerId: userId };
}

export function canAccessForm(
  form: { ownerId: string },
  role: string | undefined,
  userId: string,
) {
  if (canReadAllForms(role)) return true;
  return form.ownerId === userId;
}

export function canMutateForm(
  form: { ownerId: string },
  role: string | undefined,
  userId: string,
) {
  if (isAdmin(role)) return true;
  return form.ownerId === userId;
}

export async function nextRefCode() {
  const year = new Date().getUTCFullYear();
  const prefix = `FRM-${year}-`;
  const latest = await prisma.form.findFirst({
    where: { refCode: { startsWith: prefix } },
    orderBy: { refCode: "desc" },
    select: { refCode: true },
  });
  const current = latest ? Number(latest.refCode.slice(prefix.length)) : 0;
  return `${prefix}${String(current + 1).padStart(4, "0")}`;
}

export async function writeActivity(params: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  formId?: string | null;
  summary?: unknown;
  ip?: string | null;
}) {
  await prisma.formActivityLog.create({
    data: {
      userId: params.userId || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      formId: params.formId || null,
      summary: params.summary === undefined ? undefined : (params.summary as object),
      ip: params.ip || null,
    },
  });
}

export function assertLock(form: { lockVersion: number }, lockVersion: unknown) {
  if (lockVersion === undefined || lockVersion === null || lockVersion === "") return;
  if (Number(lockVersion) !== form.lockVersion) {
    const error = new Error("This form was updated by someone else. Reload and try again.");
    (error as Error & { status: number }).status = 409;
    throw error;
  }
}

export async function bumpLock(formId: string) {
  return prisma.form.update({
    where: { id: formId },
    data: { lockVersion: { increment: 1 } },
  });
}

export async function assertUniqueFormTitle(title: string, exceptIds: string[] = []) {
  const name = title.trim();
  if (!name) return;
  const existing = await prisma.form.findFirst({
    where: {
      deletedAt: null,
      title: { equals: name, mode: "insensitive" },
      ...(exceptIds.length ? { id: { notIn: exceptIds } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw httpError(409, "A form with this name already exists.");
}

export async function assertUniqueTemplateName(name: string, exceptIds: string[] = []) {
  const title = name.trim();
  if (!title) return;
  const existing = await prisma.formTemplate.findFirst({
    where: {
      deletedAt: null,
      name: { equals: title, mode: "insensitive" },
      ...(exceptIds.length ? { id: { notIn: exceptIds } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw httpError(409, "A template with this name already exists.");
}

export function httpError(status: number, message: string, extra?: Record<string, unknown>) {
  const error = new Error(message) as Error & { status: number; extra?: Record<string, unknown> };
  error.status = status;
  error.extra = extra;
  return error;
}

export function sendError(error: unknown, fallback: string) {
  const known = error as { status?: number; message?: string; extra?: Record<string, unknown> };
  return {
    status: known.status || 500,
    body: {
      message: known.status ? known.message || fallback : fallback,
      ...(known.status ? {} : { error: error instanceof Error ? error.message : error }),
      ...(known.extra || {}),
    },
  };
}

export const DEFAULT_INVITE_BODY = [
  "<p>Hello {{recipient_name}},</p>",
  "<p>{{sender_name}} invited you to complete <strong>{{form_title}}</strong>",
  " for {{practice_name}}.</p>",
  "<p><a href=\"{{form_link}}\">Open the form</a></p>",
  "<p>Please submit before {{closing_date}}.</p>",
].join("");

export const DEFAULT_REMINDER_BODY = [
  "<p>Hello {{recipient_name}},</p>",
  "<p>This is a reminder to complete <strong>{{form_title}}</strong>.</p>",
  "<p><a href=\"{{form_link}}\">Open the form</a></p>",
  "<p>Closes {{closing_date}}.</p>",
].join("");
