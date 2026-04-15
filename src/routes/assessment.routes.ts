import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
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
assessmentRouter.post("/", createAssessment);
assessmentRouter.get("/:id", getAssessment);
assessmentRouter.patch("/:id", updateAssessment);
assessmentRouter.delete("/:id", deleteAssessment);

export default assessmentRouter;
