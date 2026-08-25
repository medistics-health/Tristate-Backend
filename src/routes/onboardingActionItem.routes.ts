import { Router } from "express";
import {
  verifyAuthToken,
  requireRoles,
  ROLE_GROUPS,
} from "../middleware/auth.middleware";
import {
  createActionItem,
  deleteActionItem,
  getActionItem,
  getActionItems,
  updateActionItem,
} from "../controllers/onboardingProject/actionItem";

const onboardingActionItemRouter = Router();

onboardingActionItemRouter.use(verifyAuthToken);

onboardingActionItemRouter.get("/", getActionItems);
onboardingActionItemRouter.post(
  "/",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  createActionItem,
);
onboardingActionItemRouter.get("/:id", getActionItem);
onboardingActionItemRouter.patch(
  "/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  updateActionItem,
);
onboardingActionItemRouter.delete(
  "/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  deleteActionItem,
);

export default onboardingActionItemRouter;
