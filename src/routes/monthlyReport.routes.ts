import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  submitReport,
  getReports,
  getReport,
  updateReport,
  deleteReport,
} from "../controllers/monthlyReport/monthlyReport";

const monthlyReportRouter = Router();

monthlyReportRouter.use(verifyAuthToken);

monthlyReportRouter.get("/", getReports);
monthlyReportRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), submitReport);
monthlyReportRouter.get("/:id", getReport);
monthlyReportRouter.patch("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateReport);
monthlyReportRouter.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteReport);

export default monthlyReportRouter;
