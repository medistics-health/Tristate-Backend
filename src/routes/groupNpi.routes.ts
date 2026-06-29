import { Router } from "express";
import {
  createGroupNpi,
  getGroupNpis,
  getGroupNpi,
  updateGroupNpi,
  deleteGroupNpi,
} from "../controllers/groupNpi/groupNpi";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";

const groupNpiRouter = Router();

groupNpiRouter.use(verifyAuthToken);

groupNpiRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createGroupNpi);
groupNpiRouter.get("/", getGroupNpis);
groupNpiRouter.get("/:id", getGroupNpi);
groupNpiRouter.patch("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateGroupNpi);
groupNpiRouter.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteGroupNpi);

export default groupNpiRouter;
