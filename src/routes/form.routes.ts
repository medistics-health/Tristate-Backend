import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  addQuestion,
  addRecipients,
  addSection,
  analyticsOverview,
  analyticsQuestions,
  analyticsSummary,
  analyticsTrends,
  archiveForm,
  closeForm,
  correctRecipientEmail,
  createForm,
  deleteForm,
  deleteQuestion,
  deleteSection,
  deleteTemplate,
  downloadExport,
  duplicateForm,
  duplicateQuestion,
  getForm,
  getResponse,
  getTemplate,
  listActivity,
  listForms,
  listRecipients,
  listResponses,
  listTemplates,
  myForms,
  newVersion,
  previewForm,
  publicLinkQr,
  publishForm,
  remindNow,
  removeRecipient,
  reopenForm,
  reorderForm,
  requestExport,
  resolveFormRecipients,
  restoreForm,
  saveAsTemplate,
  saveDistribution,
  sendFormNow,
  saveLogic,
  testEmail,
  updateForm,
  updateQuestion,
  updateSection,
  updateTemplate,
  useTemplate,
} from "../controllers/forms/forms";
import { getFormDocument, listFormActivity, saveFormDocument } from "../controllers/forms/editor";
import {
  getCaptcha,
  getPublicForm,
  getUploadedImage,
  saveProgress,
  submitPublicForm,
  uploadPublicImage,
} from "../controllers/forms/publicForm";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const formRouter = Router();
formRouter.use(verifyAuthToken);

formRouter.get("/", listForms);
formRouter.get("/activity", listFormActivity);
formRouter.get("/analytics/overview", analyticsOverview);
formRouter.get("/my-forms", myForms);
formRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createForm);

formRouter.get("/templates", listTemplates);
formRouter.get("/templates/:tid", getTemplate);
formRouter.put("/templates/:tid", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateTemplate);
formRouter.delete("/templates/:tid", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteTemplate);
formRouter.post("/templates/:tid/use", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), useTemplate);

formRouter.get("/exports/:eid", downloadExport);

formRouter.get("/:id/document", getFormDocument);
formRouter.put("/:id/document", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), saveFormDocument);
formRouter.get("/:id", getForm);
formRouter.put("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateForm);
formRouter.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteForm);
formRouter.post("/:id/duplicate", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), duplicateForm);
formRouter.post("/:id/publish", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), publishForm);
formRouter.post("/:id/send", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), sendFormNow);
formRouter.post("/:id/close", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), closeForm);
formRouter.post("/:id/reopen", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), reopenForm);
formRouter.post("/:id/archive", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), archiveForm);
formRouter.post("/:id/restore", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), restoreForm);
formRouter.post("/:id/new-version", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), newVersion);
formRouter.get("/:id/preview", previewForm);
formRouter.get("/:id/activity", listActivity);

formRouter.post("/:id/sections", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), addSection);
formRouter.put("/:id/sections/:sid", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateSection);
formRouter.delete("/:id/sections/:sid", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteSection);
formRouter.post("/:id/questions", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), addQuestion);
formRouter.put("/:id/questions/:qid", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateQuestion);
formRouter.delete("/:id/questions/:qid", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteQuestion);
formRouter.post("/:id/questions/:qid/duplicate", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), duplicateQuestion);
formRouter.put("/:id/order", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), reorderForm);
formRouter.put("/:id/logic", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), saveLogic);

formRouter.post("/:id/recipients/resolve", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), resolveFormRecipients);
formRouter.post("/:id/recipients", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), addRecipients);
formRouter.get("/:id/recipients", listRecipients);
formRouter.delete("/:id/recipients/:rid", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), removeRecipient);
formRouter.post("/:id/recipients/:rid/email", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), correctRecipientEmail);
formRouter.put("/:id/distribution", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), saveDistribution);
formRouter.post("/:id/test-email", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), testEmail);
formRouter.post("/:id/remind", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), remindNow);
formRouter.get("/:id/public-link/qr", publicLinkQr);
formRouter.post("/:id/save-as-template", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), saveAsTemplate);

formRouter.get("/:id/analytics/summary", analyticsSummary);
formRouter.get("/:id/analytics/questions", analyticsQuestions);
formRouter.get("/:id/analytics/trends", analyticsTrends);
formRouter.get("/:id/responses", listResponses);
formRouter.get("/:id/responses/:rid", getResponse);
formRouter.post("/:id/export", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), requestExport);

const publicFormRouter = Router();
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});
publicFormRouter.use(publicLimiter);
publicFormRouter.get("/uploads/:fileId", getUploadedImage);
publicFormRouter.get("/:token/captcha", getCaptcha);
publicFormRouter.get("/:token", getPublicForm);
publicFormRouter.put("/:token/progress", saveProgress);
publicFormRouter.post("/:token/submit", submitPublicForm);
publicFormRouter.post("/:token/upload", upload.single("file"), uploadPublicImage);

export { formRouter, publicFormRouter };
