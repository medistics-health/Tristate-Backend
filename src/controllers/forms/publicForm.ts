import fs from "fs";
import path from "path";
import { Response, Request } from "express";
import { prisma } from "../../lib/prisma";
import { signCaptcha, verifyCaptcha, detectImage, stripJpegExif, createToken, hashToken } from "../../services/forms/sanitize";
import { publicState } from "../../services/forms/publish";
import { findByToken, saveResponse } from "../../services/forms/submit";
import { snapshotOf } from "../../services/forms/snapshot";
import { loadForm, sendError } from "../../services/forms/shared";
import { uploadBufferToAzureBlob } from "../../utils/azureBlob";

function tokenOf(req: Request) {
  return String(req.params.token || "");
}

export async function getPublicForm(req: Request, res: Response) {
  try {
    const found = await findByToken(tokenOf(req));
    if (!found) return res.status(404).json({ message: "This link is invalid." });
    const state = publicState(found.form);
    if (state !== "open") {
      return res.status(403).json({ message: state === "not_open" ? "This form is not open yet." : "This form is closed.", state });
    }
    if (found.recipient?.status === "COMPLETED" && !found.form.allowMultipleResponses && !found.form.allowEditUntilClose) {
      return res.status(409).json({ message: "Already submitted.", state: "already_submitted" });
    }
    if (found.recipient && !found.recipient.openedAt && found.recipient.status !== "COMPLETED") {
      await prisma.formRecipient.update({
        where: { id: found.recipient.id },
        data: {
          openedAt: new Date(),
          status: found.recipient.status === "PENDING" || found.recipient.status === "NOT_OPENED" ? "IN_PROGRESS" : found.recipient.status,
        },
      });
    }
    const loaded = await loadForm(found.form.id);
    if (!loaded) return res.status(404).json({ message: "This link is invalid." });
    const snapshot = snapshotOf(loaded);
    let draft: unknown = null;
    if (found.recipient && found.form.allowSaveResume) {
      const progress = await prisma.formResponse.findFirst({
        where: { formId: found.form.id, recipientId: found.form.responseMode === "ANONYMOUS" ? undefined : found.recipient.id, status: "IN_PROGRESS" },
        include: { answers: true },
      });
      draft = progress?.answers || null;
    }
    return res.json({
      message: "Form loaded.",
      state: "open",
      anonymous: found.form.responseMode === "ANONYMOUS",
      requiresCaptcha: found.kind === "public",
      form: snapshot,
      draft,
    });
  } catch (error) {
    const body = sendError(error, "Unable to load form.");
    return res.status(body.status).json(body.body);
  }
}

export async function getCaptcha(_req: Request, res: Response) {
  const left = Math.floor(Math.random() * 8) + 1;
  const right = Math.floor(Math.random() * 8) + 1;
  const token = signCaptcha(String(left + right), Date.now() + 10 * 60 * 1000);
  return res.json({ message: "Captcha issued.", prompt: `What is ${left} + ${right}?`, token });
}

export async function saveProgress(req: Request, res: Response) {
  try {
    const result = await saveResponse({
      token: tokenOf(req),
      answers: req.body?.answers || {},
      submit: false,
      idempotencyKey: req.get("Idempotency-Key") || req.body?.idempotencyKey || `progress:${hashToken(tokenOf(req))}`,
      ip: req.ip,
      userAgent: req.get("user-agent") || undefined,
    });
    return res.json({ message: "Progress saved.", ...result });
  } catch (error) {
    const body = sendError(error, "Unable to save progress.");
    return res.status(body.status).json(body.body);
  }
}

export async function submitPublicForm(req: Request, res: Response) {
  try {
    const found = await findByToken(tokenOf(req));
    if (found?.kind === "public") {
      const captchaOk = verifyCaptcha(String(req.body?.captchaToken || ""), String(req.body?.captchaAnswer || ""));
      if (!captchaOk) return res.status(400).json({ message: "Captcha answer is incorrect." });
    }
    const result = await saveResponse({
      token: tokenOf(req),
      answers: req.body?.answers || {},
      submit: true,
      idempotencyKey: req.get("Idempotency-Key") || req.body?.idempotencyKey || null,
      ip: req.ip,
      userAgent: req.get("user-agent") || undefined,
    });
    return res.json({ message: result.confirmationMessage || "Thank you. Your response has been recorded.", ...result });
  } catch (error) {
    const body = sendError(error, "Unable to submit form.");
    return res.status(body.status).json(body.body);
  }
}

export async function uploadPublicImage(req: Request, res: Response) {
  try {
    const found = await findByToken(tokenOf(req));
    if (!found) return res.status(404).json({ message: "This link is invalid." });
    if (publicState(found.form) !== "open") return res.status(403).json({ message: "This form is closed." });
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ message: "Choose an image to upload." });
    if (file.size > 5 * 1024 * 1024) return res.status(400).json({ message: "Images must be 5 MB or smaller." });
    const type = detectImage(file.buffer);
    if (!type) return res.status(400).json({ message: "Only jpg, png and webp images are allowed." });
    const buffer = type === "image/jpeg" ? stripJpegExif(file.buffer) : file.buffer;
    try {
      const uploaded = await uploadBufferToAzureBlob({
        folder: `forms/${found.form.id}`,
        fileName: file.originalname || "image",
        buffer,
        contentType: type,
      });
      return res.status(201).json({ message: "Image uploaded.", file: { url: uploaded.sasUrl, blobName: uploaded.blobName, contentType: type } });
    } catch {
      const id = createToken();
      const dir = path.join(process.cwd(), "storage", "form-uploads");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, id), buffer);
      return res.status(201).json({
        message: "Image uploaded.",
        file: { id, contentType: type, url: `/api/v1/f/uploads/${id}` },
      });
    }
  } catch (error) {
    const body = sendError(error, "Unable to upload image.");
    return res.status(body.status).json(body.body);
  }
}

export async function getUploadedImage(req: Request, res: Response) {
  const id = String(req.params.fileId || "");
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) return res.status(404).json({ message: "File not found." });
  const fullPath = path.join(process.cwd(), "storage", "form-uploads", id);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ message: "File not found." });
  return res.sendFile(fullPath);
}
