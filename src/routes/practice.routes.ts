import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
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
practiceRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createPractice);
practiceRouter.post(
  "/send-onboarding-email",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  sendOnboardingEmail,
);
practiceRouter.get("/:id", getPractice);
practiceRouter.patch("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updatePractice);
practiceRouter.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deletePractice);

export default practiceRouter;
