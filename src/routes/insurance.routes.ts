import { Router } from "express";
import {
  ROLE_GROUPS,
  requireRoles,
  verifyAuthToken,
} from "../middleware/auth.middleware";
import {
  createInsuranceCarrier,
  createInsurancePlans,
  deleteInsuranceCarrier,
  deleteInsurancePlan,
  listInsuranceCarrierOptions,
  listInsurancePlanOptions,
  listInsuranceCarriers,
  updateInsuranceCarrier,
  updateInsurancePlan,
} from "../controllers/insurance/insurance";

const insuranceRouter = Router();

insuranceRouter.use(verifyAuthToken);

insuranceRouter.get("/carriers", listInsuranceCarriers);
insuranceRouter.get("/carriers/options", listInsuranceCarrierOptions);
insuranceRouter.get("/plans/options", listInsurancePlanOptions);
insuranceRouter.post(
  "/carriers",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  createInsuranceCarrier,
);
insuranceRouter.patch(
  "/carriers/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  updateInsuranceCarrier,
);
insuranceRouter.delete(
  "/carriers/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  deleteInsuranceCarrier,
);
insuranceRouter.post(
  "/plans",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  createInsurancePlans,
);
insuranceRouter.patch(
  "/plans/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  updateInsurancePlan,
);
insuranceRouter.delete(
  "/plans/:id",
  requireRoles(ROLE_GROUPS.BUSINESS_WRITE),
  deleteInsurancePlan,
);

export default insuranceRouter;
