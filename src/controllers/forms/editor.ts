import { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../lib/prisma";
import { readDocument, writeDocument, type UiDocument } from "../../services/forms/document";
import { canAccessForm, canMutateForm, httpError, ownerWhere, sendError } from "../../services/forms/shared";

function userId(req: AuthenticatedRequest) {
  if (!req.user?.sub) throw httpError(401, "Unauthorized.");
  return req.user.sub;
}

export async function getFormDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const document = await readDocument(String(req.params.id));
    if (!document) throw httpError(404, "Form not found.");
    const form = await prisma.form.findFirst({ where: { id: document.id, deletedAt: null }, select: { ownerId: true } });
    if (!form || !canAccessForm(form, req.user?.role, userId(req))) throw httpError(404, "Form not found.");
    return res.json({ message: "Form fetched.", form: document });
  } catch (error) {
    const body = sendError(error, "Unable to fetch form.");
    return res.status(body.status).json(body.body);
  }
}

export async function saveFormDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const existing = await prisma.form.findFirst({ where: { id: String(req.params.id), deletedAt: null }, select: { ownerId: true } });
    if (!existing || !canAccessForm(existing, req.user?.role, userId(req))) throw httpError(404, "Form not found.");
    if (!canMutateForm(existing, req.user?.role, userId(req))) {
      throw httpError(403, "You do not have permission for this action.");
    }
    const saved = await writeDocument(String(req.params.id), req.body as UiDocument, req.body?.lockVersion);
    return res.json({ message: "Form saved.", form: saved });
  } catch (error) {
    const body = sendError(error, "Unable to save form.");
    return res.status(body.status).json(body.body);
  }
}

export async function listFormActivity(req: AuthenticatedRequest, res: Response) {
  try {
    const forms = await prisma.form.findMany({
      where: { deletedAt: null, ...ownerWhere(req.user?.role, userId(req)) },
      select: { id: true, title: true },
    });
    const logs = await prisma.formActivityLog.findMany({
      where: { formId: { in: forms.map((form) => form.id) } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    const titles = new Map(forms.map((form) => [form.id, form.title]));
    return res.json({
      message: "Activity fetched.",
      audit: logs.map((log) => ({
        id: log.id,
        at: log.createdAt.toISOString(),
        user: log.user ? `${log.user.firstName} ${log.user.lastName}`.trim() : "System",
        action: log.action,
        formId: log.formId || "",
        formTitle: titles.get(log.formId || "") || "",
        summary: typeof log.summary === "object" && log.summary ? JSON.stringify(log.summary) : log.action,
      })),
    });
  } catch (error) {
    const body = sendError(error, "Unable to fetch activity.");
    return res.status(body.status).json(body.body);
  }
}
