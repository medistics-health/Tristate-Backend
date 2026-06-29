import { Router } from "express";
import { getSystemSettings, updateSystemSettings } from "../controllers/users/settings";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";

const settingsRouter = Router();

settingsRouter.get(
  "/",
  verifyAuthToken,
  requireRoles(ROLE_GROUPS.SETTINGS),
  getSystemSettings,
);
settingsRouter.put(
  "/",
  verifyAuthToken,
  requireRoles(ROLE_GROUPS.SETTINGS),
  updateSystemSettings,
);

export default settingsRouter;
