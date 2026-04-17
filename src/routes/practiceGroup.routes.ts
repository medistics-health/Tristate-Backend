import { Router } from "express";
import {
  createPracticeGroup,
  getPracticeGroups,
  getPracticeGroup,
  updatePracticeGroup,
  deletePracticeGroup,
} from "../controllers/practiceGroup/practiceGroup";
import { verifyAuthToken } from "../middleware/auth.middleware";

const practiceGroupRouter = Router();

practiceGroupRouter.use(verifyAuthToken);

practiceGroupRouter.post("/", createPracticeGroup);
practiceGroupRouter.get("/", getPracticeGroups);
practiceGroupRouter.get("/:id", getPracticeGroup);
practiceGroupRouter.patch("/:id", updatePracticeGroup);
practiceGroupRouter.delete("/:id", deletePracticeGroup);

export default practiceGroupRouter;
