import express from "express";
import healthRoute from "./routes/health.route";
import authRouter from "./routes/auth.routes";
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
app.use("/api/v1", authRouter);

export default app;
