import { Router } from "express";
import {
  createGroupNpi,
  getGroupNpis,
  getGroupNpi,
  updateGroupNpi,
  deleteGroupNpi,
} from "../controllers/groupNpi/groupNpi";
import { verifyAuthToken } from "../middleware/auth.middleware";

const groupNpiRouter = Router();

groupNpiRouter.use(verifyAuthToken);

groupNpiRouter.post("/", createGroupNpi);
groupNpiRouter.get("/", getGroupNpis);
groupNpiRouter.get("/:id", getGroupNpi);
groupNpiRouter.patch("/:id", updateGroupNpi);
groupNpiRouter.delete("/:id", deleteGroupNpi);

export default groupNpiRouter;
