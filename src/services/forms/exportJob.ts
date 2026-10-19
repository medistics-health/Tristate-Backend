import fs from "fs";
import path from "path";
import { FormResponseMode } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { questionSummary, loadSubmitted, dashboard } from "./analytics";
import { buildCsv, buildXlsx, exportDir, pdfReport, questionsFromSnapshot, responseRows } from "./exportFiles";
import { deliverFormEmail } from "./mailer";
import { snapshotOf } from "./snapshot";
import { loadForm } from "./shared";
import { FormEmailKind } from "../../../generated/prisma/client";

export async function writeExportFile(exportId: string) {
  const record = await prisma.formExport.findUnique({ where: { id: exportId } });
  if (!record) return;
  const form = await loadForm(record.formId);
  if (!form) {
    await prisma.formExport.update({ where: { id: exportId }, data: { status: "FAILED", error: "Form missing." } });
    return;
  }
  const filters = (record.filters || {}) as {
    practiceIds?: string[];
    from?: string;
    to?: string;
    questionId?: string;
    operator?: string;
    value?: unknown;
  };
  const responses = await loadSubmitted(form.id, {
    practiceIds: filters.practiceIds,
    from: filters.from ? new Date(filters.from) : null,
    to: filters.to ? new Date(filters.to) : null,
    questionId: filters.questionId,
    operator: filters.operator,
    value: filters.value,
  });
  const snapshot = snapshotOf(form);
  const questions = questionsFromSnapshot(snapshot);
  const anonymous = form.responseMode === FormResponseMode.ANONYMOUS;
  const revealPractice = !anonymous || form.recordPracticeWhenAnonymous;
  const rows = responseRows({
    questions,
    responses,
    anonymous,
    revealPractice,
  });
  const summary = await dashboard(form.id, {
    practiceIds: filters.practiceIds,
    from: filters.from ? new Date(filters.from) : null,
    to: filters.to ? new Date(filters.to) : null,
  }, anonymous, form.minGroupSize);
  const summaryRows = [
    ["Metric", "Value"],
    ["Total sent", String(summary.totalSent)],
    ["Responded", String(summary.responded)],
    ["Completion rate", String(summary.completionRate)],
    ["In progress", String(summary.inProgress)],
    ["Not opened", String(summary.notOpened)],
    ["Bounced", String(summary.bounced)],
    ...questions.flatMap((question) => {
      const card = questionSummary(question, responses) as { options?: Array<{ label: string; count: number; percent: number }>; average?: number | null };
      const lines = [[`Question: ${question.label}`, ""]];
      if (card.options) {
        for (const option of card.options) lines.push([option.label, `${option.count} (${option.percent}%)`]);
      } else if (card.average !== undefined) {
        lines.push(["Average", String(card.average ?? "")]);
      }
      return lines;
    }),
  ];
  const recipientRows = [
    ["Name", "Email", "Practice", "Status", "Sent", "Opened", "Completed", "Reminders"],
    ...(await prisma.formRecipient.findMany({ where: { formId: form.id } })).map((recipient) => [
      anonymous ? "" : recipient.displayName || "",
      anonymous ? "" : recipient.email,
      revealPractice ? recipient.practiceName || "" : "",
      recipient.status,
      recipient.sentAt?.toISOString() || "",
      recipient.openedAt?.toISOString() || "",
      recipient.completedAt?.toISOString() || "",
      String(recipient.reminderCount),
    ]),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  let fileName = `${form.refCode}-${stamp}.csv`;
  let buffer: Buffer;
  if (record.format === "XLSX") {
    fileName = `${form.refCode}-${stamp}.xlsx`;
    buffer = buildXlsx([
      { name: "Responses", rows },
      { name: "Summary", rows: summaryRows },
      { name: "Recipients", rows: recipientRows },
    ]);
  } else if (record.format === "PDF") {
    fileName = `${form.refCode}-${stamp}.pdf`;
    buffer = await pdfReport({
      title: form.title,
      filters: JSON.stringify(filters),
      kpis: {
        "Total sent": summary.totalSent,
        Responded: summary.responded,
        "Completion rate": summary.completionRate,
      },
      questions: questions.map((question) => {
        const card = questionSummary(question, responses) as { options?: Array<{ label: string; count: number; percent: number }>; average?: number | null; answered: number };
        const lines = [`Answered: ${card.answered}`];
        if (card.options) lines.push(...card.options.map((option) => `${option.label}: ${option.count} (${option.percent}%)`));
        if (card.average !== undefined) lines.push(`Average: ${card.average ?? "-"}`);
        return { label: question.label, lines };
      }),
    });
  } else {
    buffer = buildCsv(rows);
  }

  const fullPath = path.join(exportDir(), `${record.id}-${fileName}`);
  fs.writeFileSync(fullPath, buffer);
  await prisma.formExport.update({
    where: { id: record.id },
    data: { status: "READY", fileName, localPath: fullPath },
  });

  const requester = await prisma.user.findUnique({ where: { id: record.requestedById } });
  if (requester?.email && responses.length > 5000) {
    await deliverFormEmail({
      to: requester.email,
      subject: `Export ready: ${form.title}`,
      html: `<p>Your ${record.format} export for ${form.title} is ready. Download it from the CRM within 24 hours.</p>`,
      formId: form.id,
      kind: FormEmailKind.CREATOR_NOTICE,
    }).catch(() => undefined);
  }
}

export async function processPendingExports() {
  const pending = await prisma.formExport.findMany({ where: { status: "PENDING" }, take: 5 });
  for (const record of pending) {
    try {
      await writeExportFile(record.id);
    } catch (error) {
      await prisma.formExport.update({
        where: { id: record.id },
        data: { status: "FAILED", error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  await prisma.formExport.updateMany({
    where: { expiresAt: { lt: new Date() }, status: { not: "EXPIRED" } },
    data: { status: "EXPIRED" },
  });
}
