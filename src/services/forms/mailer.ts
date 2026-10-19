import { FormEmailKind } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { sendOutlookEmail } from "../../utils/outlook";

export function applyMerge(
  template: string,
  fields: Record<string, string>,
) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => {
    return fields[key] ?? "";
  });
}

export function formLink(token: string) {
  const base = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/f/${token}`;
}

export async function deliverFormEmail(params: {
  to: string;
  subject: string;
  html: string;
  formId: string;
  recipientId?: string | null;
  kind: FormEmailKind;
}) {
  try {
    await sendOutlookEmail(params.to, params.subject, params.html);
    await prisma.formEmailLog.create({
      data: {
        formId: params.formId,
        recipientId: params.recipientId || null,
        kind: params.kind,
        subject: params.subject,
        status: "SENT",
        sentAt: new Date(),
      },
    });
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.formEmailLog.create({
      data: {
        formId: params.formId,
        recipientId: params.recipientId || null,
        kind: params.kind,
        subject: params.subject,
        status: "FAILED",
        error: message.slice(0, 2000),
      },
    });
    const hardBounce = /not found|invalid|recipient|5\.1\.1|mailbox/i.test(message);
    return { ok: false as const, hardBounce, message };
  }
}

export async function notifyCreator(params: {
  formId: string;
  ownerEmail: string;
  subject: string;
  html: string;
}) {
  await deliverFormEmail({
    to: params.ownerEmail,
    subject: params.subject,
    html: params.html,
    formId: params.formId,
    kind: FormEmailKind.CREATOR_NOTICE,
  });
}
