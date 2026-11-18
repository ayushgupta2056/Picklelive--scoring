import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { env } from "./env";

const COOKIE = "pl_admin";
// Hash the configured password once at boot so comparisons are constant-time bcrypt checks.
const adminHash = bcrypt.hashSync(env.adminPassword, 10);

export async function verifyAdmin(email: string, password: string): Promise<boolean> {
  const okPass = await bcrypt.compare(password, adminHash);
  return okPass && email.trim().toLowerCase() === env.adminEmail;
}

export function issueAdminCookie(res: Response) {
  const token = jwt.sign({ role: "admin", email: env.adminEmail }, env.jwtSecret, { expiresIn: "7d" });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    maxAge: 7 * 24 * 3600 * 1000,
    path: "/",
  });
}

export function clearAdminCookie(res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
}

export function adminFromToken(token: string | undefined): { email: string } | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, env.jwtSecret) as { role: string; email: string };
    return p.role === "admin" ? { email: p.email } : null;
  } catch {
    return null;
  }
}

export function getAdmin(req: Request) {
  return adminFromToken(req.cookies?.[COOKIE]);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const a = getAdmin(req);
  if (!a) return res.status(401).json({ error: "Admin login required" });
  res.locals.actor = `admin:${a.email}`;
  next();
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export const ADMIN_COOKIE = COOKIE;
