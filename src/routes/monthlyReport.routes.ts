import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
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
monthlyReportRouter.post("/", submitReport);
monthlyReportRouter.get("/:id", getReport);
monthlyReportRouter.patch("/:id", updateReport);
monthlyReportRouter.delete("/:id", deleteReport);

export default monthlyReportRouter;
