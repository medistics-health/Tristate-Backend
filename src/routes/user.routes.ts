import { Router } from "express";
import { listUsers, updateUser, createUser, deleteUser } from "../controllers/users/users";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";

const userRouter = Router();

userRouter.use(verifyAuthToken);
userRouter.use(requireRoles(ROLE_GROUPS.USER_ADMIN));

userRouter.get("/", listUsers);
userRouter.post("/", createUser);
userRouter.put("/:id", updateUser);
userRouter.delete("/:id", deleteUser);

export default userRouter;
