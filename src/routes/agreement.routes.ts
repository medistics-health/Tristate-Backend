import { Router } from "express";
import {
  createAgreement,
  getAgreements,
  getAgreement,
  updateAgreement,
  deleteAgreement,
  sendAgreementEmail,
} from "../controllers/agreement/agreement";
import { verifyAuthToken } from "../middleware/auth.middleware";

const agreementRouter = Router();

agreementRouter.use(verifyAuthToken);

agreementRouter.post("/", createAgreement);
agreementRouter.post("/send-email", sendAgreementEmail);
agreementRouter.get("/", getAgreements);
agreementRouter.get("/:id", getAgreement);
agreementRouter.patch("/:id", updateAgreement);
agreementRouter.delete("/:id", deleteAgreement);

export default agreementRouter;
