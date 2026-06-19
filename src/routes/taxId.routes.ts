import { Router } from "express";
import {
  createTaxId,
  getTaxIds,
  getTaxId,
  updateTaxId,
  deleteTaxId,
} from "../controllers/taxId/taxId";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";

const taxIdRouter = Router();

taxIdRouter.use(verifyAuthToken);

taxIdRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createTaxId);
taxIdRouter.get("/", getTaxIds);
taxIdRouter.get("/:id", getTaxId);
taxIdRouter.patch("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateTaxId);
taxIdRouter.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteTaxId);

export default taxIdRouter;
