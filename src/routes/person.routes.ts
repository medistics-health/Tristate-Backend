import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
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
personRouter.post("/", createPerson);
personRouter.get("/:id", getPerson);
personRouter.patch("/:id", updatePerson);
personRouter.delete("/:id", deletePerson);

export default personRouter;
