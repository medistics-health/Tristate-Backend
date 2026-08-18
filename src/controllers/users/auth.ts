import { Request, Response } from "express";
import { UserRoles } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import type { AuthBody } from "../../types/types";

const SALT_ROUNDS = 10;
const ISSUER = "Tristate";

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
  twoFactorEnabled?: boolean;
}) {
  return {
    id: user.id,
    userName: user.userName,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
  };
}

function issueAuthCookieAndResponse(res: Response, user: any) {
  const token = jwt.sign(
    {
      sub: user.id,
      userName: user.userName,
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: "7d" },
  );

  const isProduction =
    process.env.NODE_ENV === "production" ||
    (process.env.FRONTEND_URL?.startsWith("https://") ?? false);

  return res
    .cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .status(200)
    .json({
      message: "Login successful.",
      user: sanitizeUser(user),
    });
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

    if (existingUser.twoFactorEnabled) {
      let isConfigured = Boolean(existingUser.twoFactorSecret);
      if (!isConfigured) {
        const secret = generateSecret();
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { twoFactorSecret: secret },
        });
      }
      return res.status(200).json({
        require2FA: true,
        userId: existingUser.id,
        isConfigured,
        message: isConfigured
          ? "Please enter your 6-digit 2FA code."
          : "Please scan the QR code to set up 2FA.",
      });
    }

    return issueAuthCookieAndResponse(res, existingUser);
  } catch (error) {
    return res.status(500).json({
      message: "Unable to login user.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

async function findUserFromReqOrId(req: Request, userId?: string) {
  const reqUser = (req as any).user;
  if (reqUser) {
    if (reqUser.sub) {
      const u = await prisma.user.findUnique({ where: { id: reqUser.sub } });
      if (u) return u;
    }
    if (reqUser.userName) {
      const u = await prisma.user.findUnique({ where: { userName: reqUser.userName } });
      if (u) return u;
    }
    if (reqUser.email) {
      const u = await prisma.user.findUnique({ where: { email: reqUser.email } });
      if (u) return u;
    }
  }
  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (u) return u;
  }
  return null;
}

export async function generate2FASetup(req: Request, res: Response) {
  try {
    const { userId } = req.body;
    const targetUser = await findUserFromReqOrId(req, userId);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    let secret = targetUser.twoFactorSecret;
    if (!secret) {
      secret = generateSecret();
      await prisma.user.update({
        where: { id: targetUser.id },
        data: { twoFactorSecret: secret },
      });
    }

    const otpauthUrl = generateURI({
      label: targetUser.email,
      issuer: ISSUER,
      secret,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return res.status(200).json({
      secret,
      qrCodeDataUrl,
      otpauthUrl,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to generate 2FA setup details.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function verify2FASetup(req: Request, res: Response) {
  try {
    const { userId, code } = req.body;

    if (!code || code.trim().length !== 6) {
      return res.status(400).json({ message: "6-digit verification code is required." });
    }

    const targetUser = await findUserFromReqOrId(req, userId);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    let secret = targetUser.twoFactorSecret;
    if (!secret) {
      secret = generateSecret();
      await prisma.user.update({
        where: { id: targetUser.id },
        data: { twoFactorSecret: secret },
      });
    }

    const result = verifySync({ token: code.trim(), secret, epochTolerance: 30 });

    if (!result.valid) {
      return res.status(400).json({ message: "Invalid 6-digit verification code." });
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUser.id },
      data: { twoFactorEnabled: true },
    });

    if ((req as any).user) {
      return res.status(200).json({
        message: "2FA enabled successfully.",
        user: sanitizeUser(updatedUser),
      });
    }

    return issueAuthCookieAndResponse(res, updatedUser);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to verify 2FA setup.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function verify2FALogin(req: Request, res: Response) {
  try {
    const { userId, code } = req.body;

    if (!code) {
      return res.status(400).json({ message: "6-digit code is required." });
    }

    const user = await findUserFromReqOrId(req, userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ message: "2FA is not enabled for this user." });
    }

    const result = verifySync({ token: code.trim(), secret: user.twoFactorSecret, epochTolerance: 30 });

    if (!result.valid) {
      return res.status(401).json({ message: "Invalid verification code." });
    }

    return issueAuthCookieAndResponse(res, user);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to verify 2FA login.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function toggle2FA(req: any, res: Response) {
  try {
    const { enabled } = req.body;
    const user = await findUserFromReqOrId(req);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (enabled) {
      // Generate fresh secret for setup
      const secret = generateSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorSecret: secret },
      });

      const otpauthUrl = generateURI({
        label: user.email,
        issuer: ISSUER,
        secret,
      });
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

      return res.status(200).json({
        requireSetup: true,
        secret,
        qrCodeDataUrl,
        message: "2FA setup required before enabling.",
      });
    } else {
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });

      return res.status(200).json({
        message: "2FA disabled successfully.",
        user: sanitizeUser(updatedUser),
      });
    }
  } catch (error) {
    return res.status(500).json({
      message: "Failed to toggle 2FA.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function authenticateMe(req: any, res: Response) {
  try {
    const user = await findUserFromReqOrId(req);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      id: user.id,
      name: user.userName,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
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

