import { Router } from "express";
const agreementRouter = Router();
import {
  createAgreement,
  getAgreement,
  updateAgreement,
  deleteAgreement,
} from "../controllers/agreement/agreement";
import { verifyAuthToken } from "../middleware/auth.middleware";

agreementRouter.post("/create/agreement", verifyAuthToken, createAgreement);
agreementRouter.get("/get/agreements", verifyAuthToken, getAgreement);
agreementRouter.patch("/update/agreement", verifyAuthToken, updateAgreement);
agreementRouter.delete("/delete/agreement", verifyAuthToken, deleteAgreement);

export default agreementRouter;
