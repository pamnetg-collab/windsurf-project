import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { Unauthorized } from "../lib/errors";

export interface UserTokenPayload {
  sub: string; // user id
  telegramId: string;
  kind: "user";
}

export interface AdminTokenPayload {
  sub: string; // admin id
  email: string;
  kind: "admin";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserTokenPayload;
      admin?: AdminTokenPayload;
    }
  }
}

export function signUserToken(payload: Omit<UserTokenPayload, "kind">): string {
  return jwt.sign({ ...payload, kind: "user" }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function signAdminToken(payload: Omit<AdminTokenPayload, "kind">): string {
  return jwt.sign({ ...payload, kind: "admin" }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(Unauthorized());
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as UserTokenPayload;
    if (decoded.kind !== "user") return next(Unauthorized());
    req.user = decoded;
    next();
  } catch {
    next(Unauthorized("Invalid or expired token"));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(Unauthorized());
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AdminTokenPayload;
    if (decoded.kind !== "admin") return next(Unauthorized());
    req.admin = decoded;
    next();
  } catch {
    next(Unauthorized("Invalid or expired token"));
  }
}
