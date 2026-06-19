import { Router } from "express";
import {
  createCompany,
  getCompanies,
  getCompany,
  updateCompany,
  deleteCompany,
} from "../controllers/company/company";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";

const companyRouter = Router();

companyRouter.use(verifyAuthToken);

companyRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createCompany);
companyRouter.get("/", getCompanies);
companyRouter.get("/:id", getCompany);
companyRouter.patch("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateCompany);
companyRouter.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteCompany);

export default companyRouter;
