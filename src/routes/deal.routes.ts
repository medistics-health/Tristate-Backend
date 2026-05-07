import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
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
dealRouter.post("/", createDeal);
dealRouter.get("/:id", getDeal);
dealRouter.patch("/:id", updateDeal);
dealRouter.delete("/:id", deleteDeal);

export default dealRouter;
