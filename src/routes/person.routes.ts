import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  createPerson,
  getPersons,
  getPerson,
  updatePerson,
  deletePerson,
} from "../controllers/person/person";

const personRouter = Router();

personRouter.use(verifyAuthToken);

personRouter.get("/", getPersons);
personRouter.post("/", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createPerson);
personRouter.get("/:id", getPerson);
personRouter.patch("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updatePerson);
personRouter.delete("/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deletePerson);

export default personRouter;
