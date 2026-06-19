import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  createDeal,
  getDeal,
  updateDeal,
  deleteDeal,
  getAllDeals,
} from "../controllers/deal/deal";

const dealRouter = Router();

dealRouter.use(verifyAuthToken);

dealRouter.get("/", getAllDeals);
dealRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createDeal);
dealRouter.get("/:id", getDeal);
dealRouter.patch("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateDeal);
dealRouter.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteDeal);

export default dealRouter;
