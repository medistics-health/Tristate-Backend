import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
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

export type { AuthenticatedRequest };
