import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  createCredentialingRequest,
  deleteCredentialingRequest,
  getCredentialingDashboard,
  getCredentialingRequest,
  getCredentialingRequests,
  updateCredentialingRequest,
} from "../controllers/credentialing/credentialing";

const credentialingRouter = Router();

credentialingRouter.use(verifyAuthToken);

credentialingRouter.get("/dashboard", getCredentialingDashboard);
credentialingRouter.get("/", getCredentialingRequests);
credentialingRouter.get("/:id", getCredentialingRequest);
credentialingRouter.post(
  "/",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  createCredentialingRequest,
);
credentialingRouter.patch(
  "/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  updateCredentialingRequest,
);
credentialingRouter.delete(
  "/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  deleteCredentialingRequest,
);

export default credentialingRouter;
