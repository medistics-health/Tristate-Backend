import { Router, Response, NextFunction } from "express";
import { verifyAuthToken, requireRoles, requirePrefundingPermission, ROLE_GROUPS, AuthenticatedRequest } from "../middleware/auth.middleware";
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
  deletePrefundingInvoice,
  validatePracticePrefundingEligibility
} from "../controllers/prefunding/prefundingInvoices";
import { getPrefundingDashboardData } from "../controllers/prefunding/prefundingDashboard.controller";

const prefundingRouter = Router();

prefundingRouter.use(verifyAuthToken);

// Middleware for prefunding invoice status update (APPROVE vs POST permission check)
const requireStatusChangePermission = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const role = typeof req.user?.role === "string" ? req.user.role.trim().toUpperCase() : "";
  if (role === "ADMIN") return next();

  const { status } = req.body || {};
  const statusUpper = String(status || "").toUpperCase();

  if (statusUpper === "APPROVED") {
    return requirePrefundingPermission("APPROVE")(req, res, next);
  } else if (statusUpper === "POSTED") {
    return requirePrefundingPermission("POST")(req, res, next);
  }

  return requirePrefundingPermission("EDIT")(req, res, next);
};

// Dashboard
prefundingRouter.get("/dashboard", requirePrefundingPermission("VIEW"), getPrefundingDashboardData);

// Practice Validation
prefundingRouter.get("/practices/:practiceId/validate", requirePrefundingPermission("VIEW"), validatePracticePrefundingEligibility);

// Prefunding Rates
prefundingRouter.get("/rates", requirePrefundingPermission("VIEW"), getPrefundingRates);
prefundingRouter.post("/rates", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), requirePrefundingPermission("CREATE"), createPrefundingRate);
prefundingRouter.put("/rates/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), requirePrefundingPermission("EDIT"), updatePrefundingRate);
prefundingRouter.delete("/rates/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), requirePrefundingPermission("DELETE"), deletePrefundingRate);

// Prefunding Invoices
prefundingRouter.get("/invoices", requirePrefundingPermission("VIEW"), getPrefundingInvoices);
prefundingRouter.get("/invoices/:id", requirePrefundingPermission("VIEW"), getPrefundingInvoiceById);
prefundingRouter.get("/invoices/:id/pdf", requirePrefundingPermission("VIEW"), getPrefundingInvoicePdf);
prefundingRouter.post("/invoices", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), requirePrefundingPermission("CREATE"), createPrefundingInvoice);
prefundingRouter.put("/invoices/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), requirePrefundingPermission("EDIT"), updatePrefundingInvoice);
prefundingRouter.put("/invoices/:id/status", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), requireStatusChangePermission, updatePrefundingInvoiceStatus);
prefundingRouter.post("/invoices/:id/resend", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), requirePrefundingPermission("POST"), resendPrefundingInvoice);
prefundingRouter.delete("/invoices/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), requirePrefundingPermission("DELETE"), deletePrefundingInvoice);

export default prefundingRouter;
