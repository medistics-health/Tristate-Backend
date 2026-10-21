import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  getPrefundingRates,
  createPrefundingRate,
  updatePrefundingRate,
  deletePrefundingRate
} from "../controllers/prefunding/prefundingRates";
import {
  createPrefundingInvoice,
  updatePrefundingInvoice,
  getPrefundingInvoices,
  getPrefundingInvoiceById,
  getPrefundingInvoicePdf,
  updatePrefundingInvoiceStatus,
  resendPrefundingInvoice,
  deletePrefundingInvoice
} from "../controllers/prefunding/prefundingInvoices";

const prefundingRouter = Router();

prefundingRouter.use(verifyAuthToken);

// Prefunding Rates
prefundingRouter.get("/rates", getPrefundingRates);
prefundingRouter.post("/rates", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createPrefundingRate);
prefundingRouter.put("/rates/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updatePrefundingRate);
prefundingRouter.delete("/rates/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deletePrefundingRate);

// Prefunding Invoices
prefundingRouter.get("/invoices", getPrefundingInvoices);
prefundingRouter.get("/invoices/:id", getPrefundingInvoiceById);
prefundingRouter.get("/invoices/:id/pdf", getPrefundingInvoicePdf);
prefundingRouter.post("/invoices", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createPrefundingInvoice);
prefundingRouter.put("/invoices/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updatePrefundingInvoice);
prefundingRouter.put("/invoices/:id/status", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updatePrefundingInvoiceStatus);
prefundingRouter.post("/invoices/:id/resend", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), resendPrefundingInvoice);
prefundingRouter.delete("/invoices/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deletePrefundingInvoice);

export default prefundingRouter;
