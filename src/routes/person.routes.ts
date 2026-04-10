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

personRouter.get("/", verifyAuthToken, getPersons);
personRouter.post("/", verifyAuthToken, createPerson);
personRouter.get("/:id", verifyAuthToken, getPerson);
personRouter.patch("/:id", verifyAuthToken, updatePerson);
personRouter.delete("/:id", verifyAuthToken, deletePerson);

export default personRouter;
