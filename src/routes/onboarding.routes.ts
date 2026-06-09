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
} from "../controllers/onboarding/onboardingV2";
import { verifyAuthToken } from "../middleware/auth.middleware";

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

router.post("/", createOnboarding);
router.get("/", getOnboardings);
router.get("/:id", getOnboarding);
router.put("/:id", updateOnboarding);
router.delete("/:id", deleteOnboarding);

export default router;
