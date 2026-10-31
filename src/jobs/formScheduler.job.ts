import {
  FormEmailKind,
  FormRecipientStatus,
  FormStatus,
} from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { applyMerge, deliverFormEmail, formLink, notifyCreator } from "../services/forms/mailer";
import { decryptToken } from "../services/forms/sanitize";
import { clientFormTitle } from "../services/forms/shared";
import { sendPendingInvites } from "../services/forms/dispatchInvites";
import { processPendingExports } from "../services/forms/exportJob";

const BATCH_DEFAULT = 100;
let running = false;

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

export async function processFormJobs() {
  if (running) return;
  running = true;
  try {
    await dispatchInvites();
    await dispatchReminders();
    await closeDueForms();
    await processPendingExports();
  } catch (error) {
    console.error("[form-jobs]", error);
  } finally {
    running = false;
  }
}

async function dispatchInvites() {
  const now = new Date();
  const forms = await prisma.form.findMany({
    where: {
      status: FormStatus.PUBLISHED,
      deletedAt: null,
      OR: [{ sendAt: null }, { sendAt: { lte: now } }],
    },
    select: { id: true, emailBatchSize: true },
  });
  for (const form of forms) {
    await sendPendingInvites(form.id, form.emailBatchSize || BATCH_DEFAULT);
  }
}

async function dispatchReminders() {
  const forms = await prisma.form.findMany({
    where: { status: FormStatus.PUBLISHED, deletedAt: null },
    include: { reminderSetting: true, owner: true },
  });
  const now = Date.now();
  for (const form of forms) {
    const reminder = form.reminderSetting;
    if (!reminder?.enabled) continue;
    if (form.closeAt && now >= form.closeAt.getTime()) continue;
    const recipients = await prisma.formRecipient.findMany({
      where: {
        formId: form.id,
        status: { in: [FormRecipientStatus.NOT_OPENED, FormRecipientStatus.IN_PROGRESS] },
        sentAt: { not: null },
      },
    });
    for (const recipient of recipients) {
      if (!recipient.sentAt) continue;
      if (recipient.reminderCount >= reminder.maxCount) continue;
      const anchor = recipient.lastReminderAt || recipient.sentAt;
      const waitDays = recipient.reminderCount === 0 ? reminder.firstAfterDays : reminder.repeatEveryDays;
      const due = anchor.getTime() + waitDays * 24 * 60 * 60 * 1000;
      const finalDue = reminder.finalBeforeCloseDays && form.closeAt
        ? form.closeAt.getTime() - reminder.finalBeforeCloseDays * 24 * 60 * 60 * 1000
        : null;
      const finalPending = finalDue !== null && now >= finalDue && recipient.reminderCount < reminder.maxCount && (!recipient.lastReminderAt || recipient.lastReminderAt.getTime() < finalDue);
      if (now < due && !finalPending) continue;
      const fields = mergeFields({
        name: recipient.displayName,
        email: recipient.email,
        practiceName: recipient.practiceName,
        title: clientFormTitle(form),
        link: formLink(decryptToken(recipient.tokenEncrypted)),
        closeAt: form.closeAt,
        senderName: form.senderName || form.owner.firstName,
      });
      const result = await deliverFormEmail({
        to: recipient.email,
        subject: applyMerge(reminder.subject, fields),
        html: applyMerge(reminder.body, fields),
        formId: form.id,
        recipientId: recipient.id,
        kind: FormEmailKind.REMINDER,
      });
      if (result.ok) {
        await prisma.formRecipient.update({
          where: { id: recipient.id },
          data: { reminderCount: { increment: 1 }, lastReminderAt: new Date() },
        });
      }
    }

    if (form.closeAt) {
      const hoursLeft = (form.closeAt.getTime() - now) / (60 * 60 * 1000);
      if (hoursLeft > 0 && hoursLeft <= 24) {
        const already = await prisma.formActivityLog.findFirst({
          where: { formId: form.id, action: "CLOSING_SOON" },
        });
        if (!already) {
          const completed = await prisma.formRecipient.count({ where: { formId: form.id, status: FormRecipientStatus.COMPLETED } });
          const sent = await prisma.formRecipient.count({
            where: { formId: form.id, status: { notIn: [FormRecipientStatus.PENDING, FormRecipientStatus.REMOVED, FormRecipientStatus.BOUNCED, FormRecipientStatus.FAILED] } },
          });
          const rate = sent ? Math.round((completed / sent) * 1000) / 10 : 0;
          await notifyCreator({
            formId: form.id,
            ownerEmail: form.owner.email,
            subject: `Closing soon: ${form.title}`,
            html: `<p>${form.title} closes within 24 hours. Completion rate so far: ${rate}%.</p>`,
          });
          await prisma.formActivityLog.create({
            data: {
              formId: form.id,
              action: "CLOSING_SOON",
              entityType: "form",
              entityId: form.id,
              summary: { rate },
            },
          });
        }
      }
    }
  }
}

async function closeDueForms() {
  const due = await prisma.form.findMany({
    where: {
      status: FormStatus.PUBLISHED,
      closeAt: { lte: new Date() },
      deletedAt: null,
    },
    include: { owner: true },
  });
  for (const form of due) {
    await prisma.$transaction([
      prisma.form.update({
        where: { id: form.id },
        data: { status: FormStatus.CLOSED, closedAt: new Date() },
      }),
      prisma.formRecipient.updateMany({
        where: {
          formId: form.id,
          status: { in: [FormRecipientStatus.NOT_OPENED, FormRecipientStatus.IN_PROGRESS, FormRecipientStatus.PENDING] },
        },
        data: { status: FormRecipientStatus.EXPIRED },
      }),
    ]);
    await notifyCreator({
      formId: form.id,
      ownerEmail: form.owner.email,
      subject: `Form closed: ${form.title}`,
      html: `<p>${form.title} closed automatically at its closing time.</p>`,
    }).catch(() => undefined);
    await prisma.formActivityLog.create({
      data: {
        formId: form.id,
        action: "AUTO_CLOSE",
        entityType: "form",
        entityId: form.id,
      },
    });
  }
}

export function startFormSchedulerJob() {
  const timer = setInterval(() => {
    void processFormJobs();
  }, 60 * 1000);
  timer.unref?.();
  console.log("[form-jobs] Scheduler started (every 60 seconds).");
}
