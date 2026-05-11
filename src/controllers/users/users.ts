import { Response } from "express";
import { prisma } from "../../lib/prisma";
import bcrypt from "bcryptjs";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

const SALT_ROUNDS = 10;

export async function listUsers(req: AuthenticatedRequest, res: Response) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        userName: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      message: "Users fetched successfully.",
      users,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch users.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateUser(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, role } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        firstName,
        lastName,
        email,
        role,
      },
    });

    return res.status(200).json({
      message: "User updated successfully.",
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update user.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createUser(req: AuthenticatedRequest, res: Response) {
  try {
    const { userName, firstName, lastName, email, password, role } = req.body;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ userName }, { email }] },
    });

    if (existing) {
      return res.status(400).json({ message: "Username or Email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        userName,
        firstName,
        lastName,
        email,
        password: hashedPassword,
        role,
      },
    });

    return res.status(201).json({
      message: "User created successfully.",
      user: { id: user.id, userName: user.userName, email: user.email },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create user.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteUser(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    // Prevent self-deletion if needed, but for now allow all
    await prisma.user.delete({ where: { id } });

    return res.status(200).json({ message: "User deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete user.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
