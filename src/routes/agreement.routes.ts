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
import { verifyAuthToken } from "../middleware/auth.middleware";

const agreementRouter = Router();

agreementRouter.post("/docuseal/webhook", handleDocusealWebhook);
agreementRouter.get("/docuseal/forms/:slug", getDocusealFormBySlug);

agreementRouter.use(verifyAuthToken);

agreementRouter.post("/", createAgreement);
agreementRouter.post("/send-email", sendAgreementEmail);
agreementRouter.post("/docuseal/submission", createDocusealSubmission);
agreementRouter.get("/docuseal/templates", getDocusealTemplates);
agreementRouter.get("/", getAgreements);
agreementRouter.get("/:id", getAgreement);
agreementRouter.patch("/:id", updateAgreement);
agreementRouter.delete("/:id", deleteAgreement);

export default agreementRouter;
