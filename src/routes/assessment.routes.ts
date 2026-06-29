import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  createAssessment,
  getAssessment,
  getAllAssessments,
  updateAssessment,
  deleteAssessment,
} from "../controllers/assessment/assessment";

const assessmentRouter = Router();

assessmentRouter.use(verifyAuthToken);

assessmentRouter.get("/", getAllAssessments);
assessmentRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createAssessment);
assessmentRouter.get("/:id", getAssessment);
assessmentRouter.patch("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateAssessment);
assessmentRouter.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteAssessment);

export default assessmentRouter;
