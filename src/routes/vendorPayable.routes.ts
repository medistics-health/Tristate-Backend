import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  getAllVendorPayables,
  releaseVendorPayable,
  syncVendorPayableToQuickBooks,
  generateVendorStatement,
  createVendorPayable,
  deleteVendorPayable,
  syncBillPaymentToQuickBooks,
  getVendorPayableById,
  payVendorPayable,
  downloadQuickBooksBillHandler,
} from "../controllers/vendorPayable/vendorPayable";

const vendorPayableRouter = Router();

vendorPayableRouter.use(verifyAuthToken);

vendorPayableRouter.get("/", getAllVendorPayables);
vendorPayableRouter.get("/:id", getVendorPayableById);
vendorPayableRouter.get("/:id/download-bill", downloadQuickBooksBillHandler);
vendorPayableRouter.post(
  "/",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  createVendorPayable,
);
vendorPayableRouter.post(
  "/:id/release",
  requireRoles(ROLE_GROUPS.FINANCE_WRITE),
  releaseVendorPayable,
);
vendorPayableRouter.post(
  "/:id/sync-qb",
  requireRoles(ROLE_GROUPS.FINANCE_WRITE),
  syncVendorPayableToQuickBooks,
);
vendorPayableRouter.post(
  "/:id/pay",
  requireRoles(ROLE_GROUPS.FINANCE_WRITE),
  payVendorPayable,
);
vendorPayableRouter.post(
  "/:id/bill-payments/sync",
  requireRoles(ROLE_GROUPS.FINANCE_WRITE),
  syncBillPaymentToQuickBooks,
);
vendorPayableRouter.post(
  "/:id/statement",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  generateVendorStatement,
);
vendorPayableRouter.delete(
  "/:id",
  requireRoles(ROLE_GROUPS.FINANCE_WRITE),
  deleteVendorPayable,
);

export default vendorPayableRouter;
