import { Router } from "express";
import {
  verifyAuthToken,
  requireRoles,
  ROLE_GROUPS,
} from "../middleware/auth.middleware";
import {
  createWorkstream,
  deleteWorkstream,
  getWorkstream,
  getWorkstreams,
  updateWorkstream,
} from "../controllers/onboardingProject/workstream";

const onboardingWorkstreamRouter = Router();

onboardingWorkstreamRouter.use(verifyAuthToken);

onboardingWorkstreamRouter.get("/", getWorkstreams);
onboardingWorkstreamRouter.post(
  "/",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  createWorkstream,
);
onboardingWorkstreamRouter.get("/:id", getWorkstream);
onboardingWorkstreamRouter.patch(
  "/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  updateWorkstream,
);
onboardingWorkstreamRouter.delete(
  "/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  deleteWorkstream,
);

export default onboardingWorkstreamRouter;
