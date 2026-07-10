import { Router } from "express";
import {
  createAgreement,
  getAgreements,
  getAgreement,
  updateAgreement,
  deleteAgreement,
  sendAgreementEmail,
  createDocusealSubmission,
  resubmitDocusealSubmission,
  getDocusealTemplates,
  getDocusealFormBySlug,
  handleDocusealWebhook,
} from "../controllers/agreement/agreementV3";
import { sendOnboardingForm } from "../controllers/agreement/agreementV3";
import {
  createAgreementVersion,
  getAgreementVersion,
  getAgreementVersions,
  updateAgreementVersion,
  deleteAgreementVersion,
} from "../controllers/agreement/agreementVersion";
import {
  createAgreementServiceTerm,
  getAgreementServiceTerm,
  getAgreementServiceTerms,
  updateAgreementServiceTerm,
  deleteAgreementServiceTerm,
  getAgreementServiceTermApprovalPage,
  handleAgreementServiceTermApproval,
  getAgreementServiceTermClientApprovalPage,
  handleAgreementServiceTermClientApproval,
} from "../controllers/agreement/agreementServiceTerm";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";

const agreementRouter = Router();

agreementRouter.post("/docuseal/webhook", handleDocusealWebhook);
agreementRouter.get("/docuseal/forms/:slug", getDocusealFormBySlug);
agreementRouter.get("/service-terms/:id/approval", getAgreementServiceTermApprovalPage);
agreementRouter.post("/service-terms/:id/approval", handleAgreementServiceTermApproval);
agreementRouter.get("/service-terms/:id/client-approval", getAgreementServiceTermClientApprovalPage);
agreementRouter.post("/service-terms/:id/client-approval", handleAgreementServiceTermClientApproval);

agreementRouter.use(verifyAuthToken);

agreementRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createAgreement);
agreementRouter.post(
  "/send-email",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  sendAgreementEmail,
);
agreementRouter.post(
  "/send-onboarding-form",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  sendOnboardingForm,
);
agreementRouter.post(
  "/docuseal/submission",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  createDocusealSubmission,
);
agreementRouter.post(
  "/docuseal/submission/resubmit",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  resubmitDocusealSubmission,
);
agreementRouter.get("/docuseal/templates", getDocusealTemplates);

// Agreement Version routes
agreementRouter.get("/versions", getAgreementVersions);
agreementRouter.post(
  "/versions",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  createAgreementVersion,
);
agreementRouter.get("/versions/:id", getAgreementVersion);
agreementRouter.patch(
  "/versions/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  updateAgreementVersion,
);
agreementRouter.delete(
  "/versions/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  deleteAgreementVersion,
);

// Agreement Service Term routes
agreementRouter.get("/service-terms", getAgreementServiceTerms);
agreementRouter.post(
  "/service-terms",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  createAgreementServiceTerm,
);
agreementRouter.get("/service-terms/:id", getAgreementServiceTerm);
agreementRouter.patch(
  "/service-terms/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  updateAgreementServiceTerm,
);
agreementRouter.delete(
  "/service-terms/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  deleteAgreementServiceTerm,
);

agreementRouter.get("/", getAgreements);
agreementRouter.get("/:id", getAgreement);
agreementRouter.patch("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateAgreement);
agreementRouter.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteAgreement);

export default agreementRouter;
