import { Router } from "express";
import {
  createTaxId,
  getTaxIds,
  getTaxId,
  updateTaxId,
  deleteTaxId,
} from "../controllers/taxId/taxId";
import { verifyAuthToken } from "../middleware/auth.middleware";

const taxIdRouter = Router();

taxIdRouter.use(verifyAuthToken);

taxIdRouter.post("/", createTaxId);
taxIdRouter.get("/", getTaxIds);
taxIdRouter.get("/:id", getTaxId);
taxIdRouter.patch("/:id", updateTaxId);
taxIdRouter.delete("/:id", deleteTaxId);

export default taxIdRouter;
