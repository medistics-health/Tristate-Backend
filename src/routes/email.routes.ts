import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
import { sendEmail, getEmailHistory } from "../controllers/email/email";

const emailRouter = Router();

emailRouter.post("/send", verifyAuthToken, sendEmail);
emailRouter.get("/history/:personId", verifyAuthToken, getEmailHistory);

export default emailRouter;