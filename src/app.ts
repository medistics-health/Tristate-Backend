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
import purchaseOrderRouter from "./routes/purchaseOrder.routes";
import practiceGroupRouter from "./routes/practiceGroup.routes";
import taxIdRouter from "./routes/taxId.routes";
import groupNpiRouter from "./routes/groupNpi.routes";
import onboardingRouter from "./routes/onboarding.routes";
import vendorRouter from "./routes/vendor.routes";
import { stripeRouter, stripeWebhookRouter } from "./routes/stripe.routes";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

app.use("/api/v1/stripe/webhook", stripeWebhookRouter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
app.use("/api/v1/vendors", vendorRouter);
app.use("/api/v1/invoices", invoiceRouter);
app.use("/api/v1/purchase-orders", purchaseOrderRouter);
app.use("/api/v1/practice-groups", practiceGroupRouter);
app.use("/api/v1/tax-ids", taxIdRouter);
app.use("/api/v1/group-npis", groupNpiRouter);
app.use("/api/v1/onboardings", onboardingRouter);
app.use("/api/v1/stripe", stripeRouter);

export default app;
