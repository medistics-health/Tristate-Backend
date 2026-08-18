import { Router } from "express";
const authRouter = Router();
import {
  signUp,
  login,
  authenticateMe,
  logout,
  generate2FASetup,
  verify2FASetup,
  verify2FALogin,
  toggle2FA,
} from "../controllers/users/auth";
import { verifyAuthToken } from "../middleware/auth.middleware";

authRouter.post("/signup", signUp);
authRouter.post("/login", login);
authRouter.get("/me", verifyAuthToken, authenticateMe);
authRouter.post("/logout", verifyAuthToken, logout);

// 2FA Routes
authRouter.post("/2fa/setup", (req, res, next) => { verifyAuthToken(req as any, res, () => next()); }, generate2FASetup);
authRouter.post("/2fa/verify-setup", (req, res, next) => {
  const token = req.cookies?.token;
  if (token) {
    return verifyAuthToken(req as any, res, next);
  }
  next();
}, verify2FASetup);
authRouter.post("/2fa/verify-login", verify2FALogin);
authRouter.post("/2fa/toggle", verifyAuthToken, toggle2FA);

export default authRouter;
