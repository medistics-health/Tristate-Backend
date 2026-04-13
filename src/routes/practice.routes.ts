import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
import {
  createPractice,
  getPractices,
  getPractice,
  updatePractice,
  deletePractice,
  sendOnboardingEmail,
} from "../controllers/practice/practice";

const practiceRouter = Router();

practiceRouter.use(verifyAuthToken);

practiceRouter.get("/", getPractices);
practiceRouter.post("/", createPractice);
practiceRouter.post("/send-onboarding-email", sendOnboardingEmail);
practiceRouter.get("/:id", getPractice);
practiceRouter.patch("/:id", updatePractice);
practiceRouter.delete("/:id", deletePractice);

export default practiceRouter;
