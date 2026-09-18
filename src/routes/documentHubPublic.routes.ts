import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  downloadPublicShare,
  getPublicShare,
} from "../controllers/documentHub/publicShare";

const documentHubPublicRouter = Router();

const publicShareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});

documentHubPublicRouter.use(publicShareLimiter);
documentHubPublicRouter.get("/:token", getPublicShare);
documentHubPublicRouter.get("/:token/download", downloadPublicShare);

export default documentHubPublicRouter;
