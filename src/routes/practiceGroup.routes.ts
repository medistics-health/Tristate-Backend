import { Router } from "express";
import {
  createPracticeGroup,
  getPracticeGroups,
  getPracticeGroup,
  updatePracticeGroup,
  deletePracticeGroup,
} from "../controllers/practiceGroup/practiceGroup";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";

const practiceGroupRouter = Router();

practiceGroupRouter.use(verifyAuthToken);

practiceGroupRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createPracticeGroup);
practiceGroupRouter.get("/", getPracticeGroups);
practiceGroupRouter.get("/:id", getPracticeGroup);
practiceGroupRouter.patch(
  "/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  updatePracticeGroup,
);
practiceGroupRouter.delete(
  "/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  deletePracticeGroup,
);

export default practiceGroupRouter;
