import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  getPrefundingRates,
  createPrefundingRate,
  updatePrefundingRate,
  deletePrefundingRate
} from "../controllers/prefunding/prefundingRates";
import { createPrefundingInvoice } from "../controllers/prefunding/prefundingInvoices";

const prefundingRouter = Router();

prefundingRouter.use(verifyAuthToken);

// Prefunding Rates
prefundingRouter.get("/rates", getPrefundingRates);
prefundingRouter.post("/rates", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createPrefundingRate);
prefundingRouter.put("/rates/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updatePrefundingRate);
prefundingRouter.delete("/rates/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deletePrefundingRate);

// Prefunding Invoices
prefundingRouter.post("/invoices", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createPrefundingInvoice);

export default prefundingRouter;
