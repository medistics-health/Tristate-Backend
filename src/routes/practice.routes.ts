import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
import {
  createPractice,
  getPractices,
  getPractice,
  updatePractice,
  deletePractice,
} from "../controllers/practice/practice";

const practiceRouter = Router();

practiceRouter.get("/", verifyAuthToken, getPractices);
practiceRouter.post("/", verifyAuthToken, createPractice);
practiceRouter.get("/:id", verifyAuthToken, getPractice);
practiceRouter.patch("/:id", verifyAuthToken, updatePractice);
practiceRouter.delete("/:id", verifyAuthToken, deletePractice);

export default practiceRouter;
