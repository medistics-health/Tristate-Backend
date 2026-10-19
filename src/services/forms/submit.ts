import { FormResponseStatus, FormStatus } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  normalizeStored,
  validateAnswer,
  visibleQuestionIds,
  type QuestionShape,
} from "./answers";
import { isOpenForResponses, publicState } from "./publish";
import { decryptToken, hashIp } from "./sanitize";
import { snapshotOf, type FormSnapshot } from "./snapshot";
import { httpError, loadForm } from "./shared";
import type { LogicRuleInput } from "./logic";

function questionsOf(snapshot: FormSnapshot): QuestionShape[] {
  return snapshot.questions.map((question) => ({
    id: question.id,
    key: question.key,
    type: question.type,
    label: question.label,
    isRequired: question.isRequired,
    sectionId: question.sectionId,
    config: (question.config || {}) as Record<string, unknown>,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.value,
      isOther: option.isOther,
    })),
  }));
}

export async function findByToken(token: string) {
  const hash = (await import("./sanitize")).hashToken(token);
  const recipient = await prisma.formRecipient.findUnique({
    where: { tokenHash: hash },
    include: { form: true },
  });
  if (recipient && !recipient.removedAt) {
    return { kind: "recipient" as const, recipient, form: recipient.form };
  }
  const form = await prisma.form.findUnique({ where: { publicLinkTokenHash: hash } });
  if (form?.publicLinkEnabled && !form.deletedAt) {
    return { kind: "public" as const, recipient: null, form };
  }
  return null;
}

export async function saveResponse(params: {
  token: string;
  answers: Record<string, unknown>;
  submit: boolean;
  idempotencyKey?: string | null;
  ip?: string;
  userAgent?: string;
}) {
  const found = await findByToken(params.token);
  if (!found) throw httpError(404, "This link is invalid.");
  const form = found.form;
  const state = publicState(form);
  if (found.recipient?.status === "REMOVED" || found.recipient?.removedAt) {
    throw httpError(404, "This link is invalid.");
  }
  if (state === "not_open") throw httpError(403, "This form is not open yet.");
  if (state === "closed" || state === "invalid") throw httpError(403, "This form is closed.");
  if (!isOpenForResponses(form) && form.status === FormStatus.PUBLISHED && form.closeAt && form.closeAt.getTime() <= Date.now()) {
    throw httpError(403, "This form is closed.");
  }

  if (
    found.recipient &&
    found.recipient.status === "COMPLETED" &&
    !form.allowMultipleResponses &&
    !(form.allowEditUntilClose && params.submit)
  ) {
    throw httpError(409, "Already submitted.");
  }

  const loaded = await loadForm(form.id);
  if (!loaded) throw httpError(404, "This link is invalid.");
  const snapshot = snapshotOf(loaded);
  const questions = questionsOf(snapshot);
  const rules: LogicRuleInput[] = snapshot.logic.map((rule) => ({
    targetType: rule.targetType,
    targetId: rule.targetId,
    action: rule.action,
    matchType: rule.matchType,
    conditions: rule.conditions,
  }));
  const visible = visibleQuestionIds(questions, snapshot.sections, rules, params.answers);
  const stored = new Map<string, ReturnType<typeof normalizeStored>>();
  const errors: string[] = [];

  for (const question of questions) {
    if (!visible.has(question.id) || question.type === "CONTENT") continue;
    const raw = params.answers[question.id] ?? params.answers[question.key];
    const normalized = normalizeStored(question, raw);
    if ("error" in normalized) {
      errors.push(normalized.error);
      continue;
    }
    if (params.submit) {
      errors.push(...validateAnswer(question, normalized, question.isRequired));
    }
    stored.set(question.id, normalized);
  }
  if (errors.length) throw httpError(400, "The form has validation errors.", { errors });

  const anonymous = form.responseMode === "ANONYMOUS";
  const oneResponse = !form.allowMultipleResponses;
  const idempotencyKey =
    params.idempotencyKey ||
    (oneResponse && found.recipient ? `once:${found.recipient.id}` : `submit:${found.form.id}:${Date.now()}:${Math.random()}`);

  const existing =
    (await prisma.formResponse.findUnique({ where: { idempotencyKey } })) ||
    (found.recipient && !anonymous
      ? await prisma.formResponse.findFirst({
          where: {
            formId: form.id,
            recipientId: found.recipient.id,
            ...(oneResponse ? {} : { idempotencyKey }),
            ...(oneResponse ? { submissionSlot: "single" } : {}),
          },
        })
      : null);
  if (existing?.status === FormResponseStatus.SUBMITTED && !form.allowEditUntilClose) {
    return { responseId: existing.id, alreadyRecorded: true, confirmationMessage: snapshot.confirmationMessage, redirectUrl: snapshot.redirectUrl };
  }

  const practiceId =
    !anonymous || form.recordPracticeWhenAnonymous ? found.recipient?.practiceId || null : null;

  const response = await prisma.$transaction(async (tx) => {
    if (params.submit && found.recipient && oneResponse && found.recipient.status !== "COMPLETED") {
      const marked = await tx.formRecipient.updateMany({
        where: { id: found.recipient.id, status: { notIn: ["COMPLETED", "REMOVED", "BOUNCED"] } },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      if (marked.count === 0 && !form.allowEditUntilClose) {
        throw httpError(409, "Already submitted.");
      }
    } else if (params.submit && found.recipient && oneResponse && form.allowEditUntilClose) {
      await tx.formRecipient.update({
        where: { id: found.recipient.id },
        data: { status: "COMPLETED", completedAt: found.recipient.completedAt || new Date() },
      });
    } else if (!params.submit && found.recipient && found.recipient.status !== "COMPLETED") {
      await tx.formRecipient.update({
        where: { id: found.recipient.id },
        data: {
          status: "IN_PROGRESS",
          openedAt: found.recipient.openedAt || new Date(),
        },
      });
    }

    const slot = anonymous || !oneResponse ? idempotencyKey : "single";
    const row = existing
      ? await tx.formResponse.update({
          where: { id: existing.id },
          data: {
            status: params.submit ? FormResponseStatus.SUBMITTED : FormResponseStatus.IN_PROGRESS,
            submittedAt: params.submit ? new Date() : null,
            practiceId,
          },
        })
      : await tx.formResponse.create({
          data: {
            formId: form.id,
            formVersionNo: form.versionNo,
            recipientId: anonymous ? null : found.recipient?.id || null,
            practiceId,
            status: params.submit ? FormResponseStatus.SUBMITTED : FormResponseStatus.IN_PROGRESS,
            submissionSlot: found.recipient && !anonymous ? slot : idempotencyKey,
            submittedAt: params.submit ? new Date() : null,
            idempotencyKey,
            ipHash: hashIp(params.ip),
            userAgent: params.userAgent?.slice(0, 300) || null,
          },
        });

    await tx.formResponseAnswer.deleteMany({ where: { responseId: row.id } });
    for (const [questionId, value] of stored) {
      if ("error" in value) continue;
      const hasValue =
        value.valueText ||
        value.valueNumber !== undefined && value.valueNumber !== null ||
        value.valueDate ||
        value.valueJson !== undefined ||
        value.fileRefs;
      if (!hasValue) continue;
      await tx.formResponseAnswer.create({
        data: {
          responseId: row.id,
          questionId,
          valueText: value.valueText || null,
          valueNumber: value.valueNumber ?? null,
          valueDate: value.valueDate || null,
          valueJson: value.valueJson === undefined ? undefined : (value.valueJson as object),
          fileRefs: value.fileRefs === undefined ? undefined : (value.fileRefs as object),
        },
      });
    }
    return row;
  });

  if (params.submit && form.sendReceipt && found.recipient && !anonymous) {
    const { deliverFormEmail } = await import("./mailer");
    const { FormEmailKind } = await import("../../../generated/prisma/client");
    await deliverFormEmail({
      to: found.recipient.email,
      subject: `Response received: ${form.title}`,
      html: `<p>Your response to ${form.title} has been recorded.</p>`,
      formId: form.id,
      kind: FormEmailKind.CREATOR_NOTICE,
    }).catch(() => undefined);
  }

  return {
    responseId: response.id,
    alreadyRecorded: false,
    saved: !params.submit,
    confirmationMessage: snapshot.confirmationMessage,
    redirectUrl: snapshot.redirectUrl,
  };
}

export function recipientToken(recipient: { tokenEncrypted: string }) {
  return decryptToken(recipient.tokenEncrypted);
}
