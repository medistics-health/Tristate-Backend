import { Router } from "express";
import {
  createAgreement,
  getAgreements,
  getAgreement,
  updateAgreement,
  deleteAgreement,
  sendAgreementEmail,
  createDocusealSubmission,
  getDocusealTemplates,
  getDocusealFormBySlug,
  handleDocusealWebhook,
} from "../controllers/agreement/agreement";
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
} from "../controllers/agreement/agreementServiceTerm";
import { verifyAuthToken } from "../middleware/auth.middleware";

const agreementRouter = Router();

agreementRouter.post("/docuseal/webhook", handleDocusealWebhook);
agreementRouter.get("/docuseal/forms/:slug", getDocusealFormBySlug);

agreementRouter.use(verifyAuthToken);

agreementRouter.post("/", createAgreement);
agreementRouter.post("/send-email", sendAgreementEmail);
agreementRouter.post("/docuseal/submission", createDocusealSubmission);
agreementRouter.get("/docuseal/templates", getDocusealTemplates);

// Agreement Version routes
agreementRouter.get("/versions", getAgreementVersions);
agreementRouter.post("/versions", createAgreementVersion);
agreementRouter.get("/versions/:id", getAgreementVersion);
agreementRouter.patch("/versions/:id", updateAgreementVersion);
agreementRouter.delete("/versions/:id", deleteAgreementVersion);

// Agreement Service Term routes
agreementRouter.get("/service-terms", getAgreementServiceTerms);
agreementRouter.post("/service-terms", createAgreementServiceTerm);
agreementRouter.get("/service-terms/:id", getAgreementServiceTerm);
agreementRouter.patch("/service-terms/:id", updateAgreementServiceTerm);
agreementRouter.delete("/service-terms/:id", deleteAgreementServiceTerm);

agreementRouter.get("/", getAgreements);
agreementRouter.get("/:id", getAgreement);
agreementRouter.patch("/:id", updateAgreement);
agreementRouter.delete("/:id", deleteAgreement);

export default agreementRouter;
