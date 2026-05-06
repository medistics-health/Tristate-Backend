import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
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
} from "../controllers/quickbooks/quickbooks";

const quickBooksRouter = Router();
const quickBooksCallbackRouter = Router();

quickBooksCallbackRouter.get("/", completeQuickBooksConnectionHandler);

quickBooksRouter.use(verifyAuthToken);
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

export { quickBooksRouter, quickBooksCallbackRouter };
