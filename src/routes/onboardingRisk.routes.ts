import { Router } from "express";
import {
  verifyAuthToken,
  requireRoles,
  ROLE_GROUPS,
} from "../middleware/auth.middleware";
import {
  createRisk,
  deleteRisk,
  getRisk,
  getRisks,
  updateRisk,
} from "../controllers/onboardingProject/risk";

const onboardingRiskRouter = Router();

onboardingRiskRouter.use(verifyAuthToken);

onboardingRiskRouter.get("/", getRisks);
onboardingRiskRouter.post(
  "/",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  createRisk,
);
onboardingRiskRouter.get("/:id", getRisk);
onboardingRiskRouter.patch(
  "/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  updateRisk,
);
onboardingRiskRouter.delete(
  "/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  deleteRisk,
);

export default onboardingRiskRouter;
