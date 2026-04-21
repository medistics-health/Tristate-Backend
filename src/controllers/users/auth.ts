import { Request, Response } from "express";
import { UserRoles } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { AuthBody } from "../../types/types";

const SALT_ROUNDS = 10;

function getJwtSecret() {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not set.");
  }

  return jwtSecret;
}

function sanitizeUser(user: {
  id: string;
  userName: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}) {
  return {
    id: user.id,
    userName: user.userName,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  };
}

function isUserRole(role: string): role is UserRoles {
  return Object.values(UserRoles).includes(role as UserRoles);
}

export async function signUp(req: Request, res: Response) {
  try {
    const { userName, firstName, lastName, email, password, role } =
      req.body as AuthBody;

    if (!userName || !firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({
        message:
          "userName, firstName, lastName, email, password and role are required.",
      });
    }

    if (!isUserRole(role)) {
      return res.status(400).json({
        message: "Invalid role supplied.",
        allowedRoles: Object.values(UserRoles),
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ userName }, { email }],
      },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "User already exists with this username or email.",
      });
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
      user: sanitizeUser(user),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to sign up user.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        message: "userName/email and password are required.",
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ userName: identifier }, { email: identifier }],
      },
    });

    if (!existingUser) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      existingUser.password,
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid credentials.",
      });
    }

    const token = jwt.sign(
      {
        sub: existingUser.id,
        userName: existingUser.userName,
        email: existingUser.email,
        role: existingUser.role,
      },
      getJwtSecret(),
      { expiresIn: "7d" },
    );

    return res
      .cookie("token", token, {
        httpOnly: true, // prevents JS access
        secure: false, // only over HTTPS (use false in local dev)
        sameSite: "none", // CSRF protection
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      })
      .status(200)
      .json({
        message: "Login successful.",
        user: sanitizeUser(existingUser),
      });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to login user.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function authenticateMe(req: any, res: Response) {
  try {
    const username = req.user.userName;

    const user = await prisma.user.findUnique({
      where: { userName: username },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      id: user.id,
      name: user.userName,
      email: user.email,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to authenticate",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to login user.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
