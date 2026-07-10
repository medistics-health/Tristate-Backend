import express, { Router } from "express";
import {
  createOnboarding,
  createExternalOnboarding,
  deleteExternalOnboardingDocument,
  getExternalOnboardingByPractice,
  uploadExternalOnboardingDocument,
  getOnboardings,
  getOnboarding,
  updateOnboarding,
  deleteOnboarding,
} from "../controllers/onboarding/onboardingV3";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";

const router = Router();

router.get("/external/:practiceId", getExternalOnboardingByPractice);
router.post("/external", createExternalOnboarding);
router.post(
  "/external/upload-document",
  express.raw({ type: "*/*", limit: "25mb" }),
  uploadExternalOnboardingDocument,
);
router.post("/external/delete-document", deleteExternalOnboardingDocument);

router.use(verifyAuthToken);

router.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createOnboarding);
router.get("/", getOnboardings);
router.get("/:id", getOnboarding);
router.put("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateOnboarding);
router.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteOnboarding);

export default router;
