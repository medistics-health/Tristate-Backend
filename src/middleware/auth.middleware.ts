import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UserRoles } from "../../generated/prisma/client";
import type { AuthTokenPayload } from "../types/types";

type AuthenticatedRequest = Request & {
  user?: AuthTokenPayload;
};

function getJwtSecret() {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not set.");
  }

  return jwtSecret;
}

export function verifyAuthToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { token } = req.cookies;

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized. Token cookie is missing.",
      });
    }

    const decoded = jwt.verify(token, getJwtSecret()) as AuthTokenPayload;

    req.user = decoded;

    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Unauthorized. Invalid or expired token.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export const ROLE_GROUPS = {
  ALL: Object.values(UserRoles),
  BUSINESS_WRITE: [
    UserRoles.ADMIN,
    UserRoles.SALES,
    UserRoles.ACCOUNTMANAGER,
    UserRoles.OPERATIONS,
  ],
  FINANCE_WRITE: [UserRoles.ADMIN, UserRoles.FINANCE],
  OPERATIONS_AND_FINANCE_WRITE: [
    UserRoles.ADMIN,
    UserRoles.FINANCE,
    UserRoles.OPERATIONS,
  ],
  INTEGRATIONS: [UserRoles.ADMIN, UserRoles.FINANCE],
  SETTINGS: [UserRoles.ADMIN],
  USER_ADMIN: [UserRoles.ADMIN],
};

export function requireRoles(allowedRoles: UserRoles[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role as UserRoles | undefined;

    if (!role) {
      return res.status(401).json({
        message: "Unauthorized. User role is missing.",
      });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        message: "Forbidden. You do not have permission for this action.",
      });
    }

    return next();
  };
}

export type { AuthenticatedRequest };
