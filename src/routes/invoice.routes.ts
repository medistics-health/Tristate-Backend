import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  createInvoice,
  getInvoice,
  getInvoicePdf,
  getInvoiceReceiptPdf,
  getAllInvoices,
  updateInvoice,
  deleteInvoice,
  getInvoiceStripeEvents,
  resendStripeInvoice,
} from "../controllers/invoice/invoice";
import { getInvoiceStripePayoutSummary } from "../controllers/invoice/invoiceTransfer";
import {
  createInvoiceLineItem,
  getInvoiceLineItem,
  getAllInvoiceLineItems,
  updateInvoiceLineItem,
  deleteInvoiceLineItem,
} from "../controllers/invoice/invoiceLineItem";

const invoiceRouter = Router();

invoiceRouter.use(verifyAuthToken);

// Invoice routes
invoiceRouter.get("/", getAllInvoices);
invoiceRouter.post(
  "/",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  createInvoice,
);

// Invoice Line Item routes
invoiceRouter.get("/line-items", getAllInvoiceLineItems);
invoiceRouter.post(
  "/line-items",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  createInvoiceLineItem,
);
invoiceRouter.get("/line-items/:id", getInvoiceLineItem);
invoiceRouter.patch(
  "/line-items/:id",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  updateInvoiceLineItem,
);
invoiceRouter.delete(
  "/line-items/:id",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  deleteInvoiceLineItem,
);

// Invoice detail routes
invoiceRouter.get("/stripe-payouts", getInvoiceStripePayoutSummary);
invoiceRouter.get("/:id", getInvoice);
invoiceRouter.get("/:id/pdf", getInvoicePdf);
invoiceRouter.get("/:id/receipt-pdf", getInvoiceReceiptPdf);
invoiceRouter.patch(
  "/:id",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  updateInvoice,
);
invoiceRouter.delete(
  "/:id",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  deleteInvoice,
);

// Stripe flow routes
invoiceRouter.get("/:id/stripe-events", getInvoiceStripeEvents);
invoiceRouter.post(
  "/:id/resend",
  requireRoles(ROLE_GROUPS.FINANCE_WRITE),
  resendStripeInvoice,
);

export default invoiceRouter;
