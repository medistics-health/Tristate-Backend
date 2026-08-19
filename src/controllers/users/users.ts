import { Response } from "express";
import { prisma } from "../../lib/prisma";
import bcrypt from "bcryptjs";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

const SALT_ROUNDS = 10;

export async function listUsers(req: AuthenticatedRequest, res: Response) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.max(1, parseInt(String(req.query.limit || "10"), 10));
    const skip = (page - 1) * limit;

    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const role = req.query.role ? String(req.query.role).trim() : undefined;
    const twoFactorEnabled =
      req.query.twoFactorEnabled !== undefined && req.query.twoFactorEnabled !== ""
        ? req.query.twoFactorEnabled === "true" || req.query.twoFactorEnabled === "enabled"
        : undefined;

    const where: any = {};

    if (role) {
      where.role = role;
    }

    if (twoFactorEnabled !== undefined) {
      where.twoFactorEnabled = twoFactorEnabled;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { userName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [totalRecords, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          userName: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          twoFactorEnabled: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit) || 1;

    return res.status(200).json({
      message: "Users fetched successfully.",
      users,
      pagination: {
        totalRecords,
        totalPages,
        page,
        limit,
      },
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) return res.status(400).json({ message: "User id is required." });
    const { firstName, lastName, email, role, reset2FA } = req.body;

    const updateData: any = {
      firstName,
      lastName,
      email,
      role,
    };

    if (reset2FA === true) {
      updateData.twoFactorEnabled = false;
      updateData.twoFactorSecret = null;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      message: reset2FA ? "User updated & 2FA reset successfully." : "User updated successfully.",
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) return res.status(400).json({ message: "User id is required." });

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
