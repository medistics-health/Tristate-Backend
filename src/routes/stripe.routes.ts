import express, { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
import {
  finalizeStripeInvoice,
  handleStripeWebhook,
  sendStripeInvoice,
  syncStripeCustomer,
  syncStripeInvoice,
} from "../controllers/stripe/stripe";

const stripeRouter = Router();
const stripeWebhookRouter = Router();

stripeWebhookRouter.post("/", express.raw({ type: "application/json" }), handleStripeWebhook);

stripeRouter.use(verifyAuthToken);
stripeRouter.post("/customers/:practiceId/sync", syncStripeCustomer);
stripeRouter.post("/invoices/:invoiceId/sync", syncStripeInvoice);
stripeRouter.post("/invoices/:invoiceId/finalize", finalizeStripeInvoice);
stripeRouter.post("/invoices/:invoiceId/send", sendStripeInvoice);

export { stripeRouter, stripeWebhookRouter };
