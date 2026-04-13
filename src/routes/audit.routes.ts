import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
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
auditRouter.post("/", createAudit);
auditRouter.get("/:id", getAudit);
auditRouter.patch("/:id", updateAudit);
auditRouter.delete("/:id", deleteAudit);

export default auditRouter;
