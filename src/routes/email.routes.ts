import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import { sendEmail, getEmailHistory, getSentEmails } from "../controllers/email/email";

const emailRouter = Router();

emailRouter.use(verifyAuthToken);

emailRouter.post("/send", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), sendEmail);
emailRouter.get("/history/:personId", getEmailHistory);
emailRouter.get("/sent", getSentEmails);

export default emailRouter;
