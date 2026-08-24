import "dotenv/config";
import express from "express";
import healthRoute from "./routes/health.route";
import authRouter from "./routes/auth.routes";
import companyRouter from "./routes/company.routes";
import personRouter from "./routes/person.routes";
import practiceRouter from "./routes/practice.routes";
import agreementRouter from "./routes/agreement.routes";
import auditRouter from "./routes/audit.routes";
import assessmentRouter from "./routes/assessment.routes";
import emailRouter from "./routes/email.routes";
import serviceRouter from "./routes/service.routes";
import invoiceRouter from "./routes/invoice.routes";
import dealRouter from "./routes/deal.routes";
import purchaseOrderRouter from "./routes/purchaseOrder.routes";
import practiceGroupRouter from "./routes/practiceGroup.routes";
import taxIdRouter from "./routes/taxId.routes";
import groupNpiRouter from "./routes/groupNpi.routes";
import onboardingRouter from "./routes/onboarding.routes";
import onboardingWorkstreamRouter from "./routes/onboardingWorkstream.routes";
import onboardingRiskRouter from "./routes/onboardingRisk.routes";
import monthlyReportRouter from "./routes/monthlyReport.routes";
import vendorRouter from "./routes/vendor.routes";
import billingRouter from "./routes/billing.routes";
import vendorPayableRouter from "./routes/vendorPayable.routes";
import credentialingRouter from "./routes/credentialing.routes";
import insuranceRouter from "./routes/insurance.routes";
import portalRouter from "./routes/portal.routes";
import { stripeRouter, stripeWebhookRouter } from "./routes/stripe.routes";
import {
  quickBooksRouter,
  quickBooksCallbackRouter,
} from "./routes/quickbooks.routes";
import userRouter from "./routes/user.routes";
import settingsRouter from "./routes/settings.routes";
import mercuryRouter from "./routes/mercury.routes";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";

const app = express();

app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/v1/stripe/webhook", stripeWebhookRouter);
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);

app.use("/health", healthRoute);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/companies", companyRouter);
app.use("/api/v1/persons", personRouter);
app.use("/api/v1/practices", practiceRouter);
app.use("/api/v1/agreements", agreementRouter);
app.use("/api/v1/emails", emailRouter);
app.use("/api/v1/audits", auditRouter);
app.use("/api/v1/assessments", assessmentRouter);
app.use("/api/v1/services", serviceRouter);
app.use("/api/v1/onboarding", onboardingRouter);
app.use("/api/v1/vendors", vendorRouter);
app.use("/api/v1/vendor-payables", vendorPayableRouter);
app.use("/api/v1/credentialing", credentialingRouter);
app.use("/api/v1/insurance", insuranceRouter);
app.use("/api/v1/billing", billingRouter);
app.use("/api/v1/invoices", invoiceRouter);
app.use("/api/v1/purchase-orders", purchaseOrderRouter);
app.use("/api/v1/practice-groups", practiceGroupRouter);
app.use("/api/v1/tax-ids", taxIdRouter);
app.use("/api/v1/group-npis", groupNpiRouter);
app.use("/api/v1/onboardings", onboardingRouter);
app.use("/api/v1/onboarding-workstreams", onboardingWorkstreamRouter);
app.use("/api/v1/onboarding-risks", onboardingRiskRouter);
app.use("/api/v1/monthly-reports", monthlyReportRouter);
app.use("/api/v1/portal", portalRouter);
app.use("/api/v1/stripe", stripeRouter);
app.use("/api/v1/quickbooks/callback", quickBooksCallbackRouter);
app.use("/api/v1/quickbooks", quickBooksRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/deals", dealRouter);
app.use("/api/v1/settings", settingsRouter);
app.use("/api/v1/mercury", mercuryRouter);

export default app;
