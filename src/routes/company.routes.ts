import { Router } from "express";
import {
  createCompany,
  getCompanies,
  getCompany,
  updateCompany,
  deleteCompany,
} from "../controllers/company/company";
import { verifyAuthToken } from "../middleware/auth.middleware";

const companyRouter = Router();

companyRouter.use(verifyAuthToken);

companyRouter.post("/", createCompany);
companyRouter.get("/", getCompanies);
companyRouter.get("/:id", getCompany);
companyRouter.patch("/:id", updateCompany);
companyRouter.delete("/:id", deleteCompany);

export default companyRouter;
