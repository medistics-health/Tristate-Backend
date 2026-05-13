import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
import {
  getAllVendorPayables,
  releaseVendorPayable,
  syncVendorPayableToQuickBooks,
  generateVendorStatement,
  createVendorPayable,
  deleteVendorPayable,
} from "../controllers/vendorPayable/vendorPayable";

const vendorPayableRouter = Router();

vendorPayableRouter.use(verifyAuthToken);

vendorPayableRouter.get("/", getAllVendorPayables);
vendorPayableRouter.post("/", createVendorPayable);
vendorPayableRouter.post("/:id/release", releaseVendorPayable);
vendorPayableRouter.post("/:id/sync-qb", syncVendorPayableToQuickBooks);
vendorPayableRouter.post("/:id/statement", generateVendorStatement);
vendorPayableRouter.delete("/:id", deleteVendorPayable);

export default vendorPayableRouter;
