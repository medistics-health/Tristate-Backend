import { Router } from "express";
import { listUsers, updateUser, createUser, deleteUser } from "../controllers/users/users";
import { verifyAuthToken } from "../middleware/auth.middleware";

const userRouter = Router();

userRouter.use(verifyAuthToken);

userRouter.get("/", listUsers);
userRouter.post("/", createUser);
userRouter.put("/:id", updateUser);
userRouter.delete("/:id", deleteUser);

export default userRouter;
