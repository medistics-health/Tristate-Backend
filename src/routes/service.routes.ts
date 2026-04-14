import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
import {
  createService,
  getService,
  getAllServices,
  updateService,
  deleteService,
} from "../controllers/service/service";

const serviceRouter = Router();

serviceRouter.use(verifyAuthToken);

serviceRouter.get("/", getAllServices);
serviceRouter.post("/", createService);
serviceRouter.get("/:id", getService);
serviceRouter.patch("/:id", updateService);
serviceRouter.delete("/:id", deleteService);

export default serviceRouter;
