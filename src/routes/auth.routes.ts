import { Router } from "express";
const authRouter = Router();
import {
  signUp,
  login,
  authenticateMe,
  logout,
} from "../controllers/users/auth";
import { verifyAuthToken } from "../middleware/auth.middleware";

authRouter.post("/signup", signUp);
authRouter.post("/login", login);
authRouter.get("/me", verifyAuthToken, authenticateMe);
authRouter.post("/logout", verifyAuthToken, logout);

export default authRouter;
