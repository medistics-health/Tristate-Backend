import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  createPurchaseOrder,
  getPurchaseOrder,
  getAllPurchaseOrders,
  updatePurchaseOrder,
  deletePurchaseOrder,
} from "../controllers/purchaseOrder/purchaseOrder";

const purchaseOrderRouter = Router();

purchaseOrderRouter.use(verifyAuthToken);

purchaseOrderRouter.get("/", getAllPurchaseOrders);
purchaseOrderRouter.post(
  "/",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  createPurchaseOrder,
);
purchaseOrderRouter.get("/:id", getPurchaseOrder);
purchaseOrderRouter.patch(
  "/:id",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  updatePurchaseOrder,
);
purchaseOrderRouter.delete(
  "/:id",
  requireRoles(ROLE_GROUPS.OPERATIONS_AND_FINANCE_WRITE),
  deletePurchaseOrder,
);

export default purchaseOrderRouter;
