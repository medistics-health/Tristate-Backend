import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
import { sendEmail, getEmailHistory } from "../controllers/email/email";

const emailRouter = Router();

emailRouter.use(verifyAuthToken);

emailRouter.post("/send", sendEmail);
emailRouter.get("/history/:personId", getEmailHistory);

export default emailRouter;
