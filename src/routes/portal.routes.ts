import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
import { getClientPortalSnapshot } from "../controllers/portal/portal";

const portalRouter = Router();

portalRouter.use(verifyAuthToken);

portalRouter.get("/snapshot", getClientPortalSnapshot);

export default portalRouter;
