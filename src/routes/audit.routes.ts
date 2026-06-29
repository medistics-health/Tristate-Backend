import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  createAudit,
  getAudit,
  getAllAudits,
  updateAudit,
  deleteAudit,
} from "../controllers/audit/audit";

const auditRouter = Router();

auditRouter.use(verifyAuthToken);

auditRouter.get("/", getAllAudits);
auditRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createAudit);
auditRouter.get("/:id", getAudit);
auditRouter.patch("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateAudit);
auditRouter.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteAudit);

export default auditRouter;
