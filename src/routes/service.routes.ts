import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  createService,
  getService,
  getAllServices,
  updateService,
  deleteService,
} from "../controllers/service/service";

const serviceRouter = Router();

serviceRouter.use(verifyAuthToken);

serviceRouter.get("/", getAllServices);
serviceRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createService);
serviceRouter.get("/:id", getService);
serviceRouter.patch("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateService);
serviceRouter.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteService);

export default serviceRouter;
