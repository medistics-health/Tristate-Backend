import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
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
vendorRouter.post("/", createVendor);
vendorRouter.get("/:id", getVendor);
vendorRouter.patch("/:id", updateVendor);
vendorRouter.delete("/:id", deleteVendor);

export default vendorRouter;