import { Router } from "express";
import { getSystemSettings, updateSystemSettings } from "../controllers/users/settings";
import { verifyAuthToken } from "../middleware/auth.middleware";

const settingsRouter = Router();

settingsRouter.get("/", verifyAuthToken, getSystemSettings);
settingsRouter.put("/", verifyAuthToken, updateSystemSettings);

export default settingsRouter;
