import { Router } from "express";
import {
  createOnboarding,
  createExternalOnboarding,
  getExternalOnboardingByPractice,
  getOnboardings,
  getOnboarding,
  updateOnboarding,
  deleteOnboarding,
} from "../controllers/onboarding/onboarding";
import { verifyAuthToken } from "../middleware/auth.middleware";

const router = Router();

router.get("/external/:practiceId", getExternalOnboardingByPractice);
router.post("/external", createExternalOnboarding);

router.use(verifyAuthToken);

router.post("/", createOnboarding);
router.get("/", getOnboardings);
router.get("/:id", getOnboarding);
router.put("/:id", updateOnboarding);
router.delete("/:id", deleteOnboarding);

export default router;
