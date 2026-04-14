import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
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
purchaseOrderRouter.post("/", createPurchaseOrder);
purchaseOrderRouter.get("/:id", getPurchaseOrder);
purchaseOrderRouter.patch("/:id", updatePurchaseOrder);
purchaseOrderRouter.delete("/:id", deletePurchaseOrder);

export default purchaseOrderRouter;
