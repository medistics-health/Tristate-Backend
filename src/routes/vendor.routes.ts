import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  createVendor,
  getVendor,
  updateVendor,
  deleteVendor,
  getVendors,
} from "../controllers/vendor/vendor";

const vendorRouter = Router();

vendorRouter.use(verifyAuthToken);

vendorRouter.get("/", getVendors);
vendorRouter.post(
  "/",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  createVendor,
);
vendorRouter.get("/:id", getVendor);
vendorRouter.patch(
  "/:id",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  updateVendor,
);
vendorRouter.delete(
  "/:id",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  deleteVendor,
);

export default vendorRouter;