import "dotenv/config";
import express from "express";
import healthRoute from "./routes/health.route";
import authRouter from "./routes/auth.routes";
import companyRouter from "./routes/company.routes";
import personRouter from "./routes/person.routes";
import practiceRouter from "./routes/practice.routes";
import agreementRouter from "./routes/agreement.routes";
import auditRouter from "./routes/audit.routes";
import emailRouter from "./routes/email.routes";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: "http://localhost:5173",
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

export default app;
