import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  completeQuickBooksConnectionHandler,
  disconnectQuickBooksConnectionHandler,
  getQuickBooksConnectionStatusHandler,
  startQuickBooksConnectionHandler,
  syncQuickBooksCustomerHandler,
  syncQuickBooksInvoiceHandler,
  syncQuickBooksPaymentHandler,
  syncQuickBooksVendorBillHandler,
  syncQuickBooksVendorBillPaymentHandler,
  syncQuickBooksVendorHandler,
  quickSyncInvoicePaymentHandler,
  getExternalSyncLogsHandler,
  getQuickBooksSyncSummaryHandler,
  retryExternalSyncHandler,
} from "../controllers/quickbooks/quickbooks";

const quickBooksRouter = Router();
const quickBooksCallbackRouter = Router();

quickBooksCallbackRouter.get("/", completeQuickBooksConnectionHandler);

quickBooksRouter.use(verifyAuthToken);
quickBooksRouter.use(requireRoles(ROLE_GROUPS.INTEGRATIONS));
quickBooksRouter.post("/connect", startQuickBooksConnectionHandler);
quickBooksRouter.get("/connections/:companyId", getQuickBooksConnectionStatusHandler);
quickBooksRouter.delete("/connections/:companyId", disconnectQuickBooksConnectionHandler);
quickBooksRouter.post("/customers/:practiceId/sync", syncQuickBooksCustomerHandler);
quickBooksRouter.post("/vendors/:vendorId/sync", syncQuickBooksVendorHandler);
quickBooksRouter.post("/invoices/:invoiceId/sync", syncQuickBooksInvoiceHandler);
quickBooksRouter.post("/vendor-payables/:vendorPayableId/sync", syncQuickBooksVendorBillHandler);
quickBooksRouter.post(
  "/vendor-payables/:vendorPayableId/bill-payments/sync",
  syncQuickBooksVendorBillPaymentHandler,
);
quickBooksRouter.post("/payments/:paymentId/sync", syncQuickBooksPaymentHandler);
quickBooksRouter.post("/invoices/:invoiceId/quick-sync-payment", quickSyncInvoicePaymentHandler);

// External Sync Jobs
quickBooksRouter.get("/sync-logs", getExternalSyncLogsHandler);
quickBooksRouter.get("/sync-summary", getQuickBooksSyncSummaryHandler);
quickBooksRouter.post("/sync-logs/:jobId/retry", retryExternalSyncHandler);

export { quickBooksRouter, quickBooksCallbackRouter };
