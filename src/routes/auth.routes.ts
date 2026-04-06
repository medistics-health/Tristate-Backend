import { Router } from "express";
const authRouter = Router();
import { signUp, login } from "../controllers/users/auth";
import { verifyAuthToken } from "../middleware/auth.middleware";

authRouter.post("/signup", signUp);
authRouter.post("/login", verifyAuthToken, login);

export default authRouter;
