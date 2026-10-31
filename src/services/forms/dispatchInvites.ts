import {
  FormDeliveryStatus,
  FormEmailKind,
  FormRecipientStatus,
  FormStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { sendOutlookEmail } from "../../utils/outlook";
import { applyMerge, formLink } from "./mailer";
import { decryptToken } from "./sanitize";
import { DEFAULT_INVITE_BODY, clientFormTitle, httpError } from "./shared";

function mergeFields(params: {
  name: string | null;
  email: string;
  practiceName: string | null;
  title: string;
  link: string;
  closeAt: Date | null;
  senderName: string | null;
}) {
  return {
    recipient_name: params.name || params.email,
    practice_name: params.practiceName || "",
    form_title: params.title,
    form_link: params.link,
    closing_date: params.closeAt ? params.closeAt.toISOString() : "",
    sender_name: params.senderName || "",
  };
}

export async function sendPendingInvites(formId: string, limit = 500, immediate = false) {
  const now = new Date();
  const form = await prisma.form.findFirst({
    where: {
      id: formId,
      status: FormStatus.PUBLISHED,
      deletedAt: null,
      ...(immediate ? {} : { OR: [{ sendAt: null }, { sendAt: { lte: now } }] }),
    },
    include: { owner: true },
  });
  const result = { sent: 0, failed: 0, errors: [] as string[] };
  if (!form) return result;
  const recipients = await prisma.formRecipient.findMany({
    where: {
      formId: form.id,
      status: FormRecipientStatus.PENDING,
      removedAt: null,
      ...(immediate ? {} : { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }),
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
  const inviteBody = form.inviteBody?.includes("{{form_link}}") ? form.inviteBody : DEFAULT_INVITE_BODY;
  const senderName = form.senderName || [form.owner?.firstName, form.owner?.lastName].filter(Boolean).join(" ");
  for (const recipient of recipients) {
    try {
      const fields = mergeFields({
        name: recipient.displayName,
        email: recipient.email,
        practiceName: recipient.practiceName,
        title: clientFormTitle(form),
        link: formLink(decryptToken(recipient.tokenEncrypted)),
        closeAt: form.closeAt,
        senderName,
      });
      const subject = applyMerge(form.inviteSubject || `Complete ${clientFormTitle(form)}`, fields);
      const link = fields.form_link;
      const merged = applyMerge(inviteBody, fields);
      const html = merged.includes(link)
        ? merged
        : `
        <p>Hi ${fields.recipient_name},</p>
        <p>Please complete <strong>${clientFormTitle(form)}</strong> by clicking the link below:</p>
        <p><a href="${link}">Open the form</a></p>
        <p>If the link doesn't work, copy and paste this URL into your browser:</p>
        <p>${link}</p>
      `;
      await sendOutlookEmail(recipient.email, subject, html);
      await prisma.formEmailLog.create({
        data: {
          formId: form.id,
          recipientId: recipient.id,
          kind: FormEmailKind.INVITE,
          subject,
          status: "SENT",
          sentAt: new Date(),
        },
      });
      result.sent += 1;
      await prisma.formRecipient.update({
        where: { id: recipient.id },
        data: {
          status: FormRecipientStatus.NOT_OPENED,
          deliveryStatus: FormDeliveryStatus.SENT,
          sentAt: new Date(),
          nextAttemptAt: null,
          lastError: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send invitation.";
      result.failed += 1;
      result.errors.push(message);
      await prisma.formEmailLog.create({
        data: {
          formId: form.id,
          recipientId: recipient.id,
          kind: FormEmailKind.INVITE,
          subject: form.inviteSubject || clientFormTitle(form),
          status: "FAILED",
          error: message.slice(0, 2000),
        },
      }).catch(() => undefined);
      await prisma.formRecipient.update({
        where: { id: recipient.id },
        data: {
          deliveryStatus: FormDeliveryStatus.FAILED,
          lastError: message.slice(0, 500),
        },
      }).catch(() => undefined);
      if (immediate) throw httpError(502, message);
    }
  }
  if (result.sent && !form.invitesDispatchedAt) {
    await prisma.form.update({ where: { id: form.id }, data: { invitesDispatchedAt: new Date() } });
  }
  return result;
}
