import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { prisma } from "./db";
import { env } from "./env";

/**
 * Shared referee login: ONE username/password used by every referee. Set by the admin in Settings
 * (stored hashed in AppSetting); falls back to REF_USERNAME / REF_PASSWORD env vars.
 * A signed-in referee can score any match (unlike per-match secret links).
 */
const COOKIE = "pl_ref";
const K_USER = "ref.username";
const K_HASH = "ref.passwordHash";

export async function refLoginConfig(): Promise<{ username: string; hash: string | null; source: "settings" | "env" | "none" }> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [K_USER, K_HASH] } } });
  const u = rows.find((r) => r.key === K_USER)?.value;
  const h = rows.find((r) => r.key === K_HASH)?.value;
  if (u && h) return { username: u, hash: h, source: "settings" };
  if (env.refUsername && env.refPassword) return { username: env.refUsername, hash: bcrypt.hashSync(env.refPassword, 8), source: "env" };
  return { username: u ?? env.refUsername ?? "referee", hash: null, source: "none" };
}

export async function setRefLogin(username: string, password: string) {
  const hash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.appSetting.upsert({ where: { key: K_USER }, create: { key: K_USER, value: username }, update: { value: username } }),
    prisma.appSetting.upsert({ where: { key: K_HASH }, create: { key: K_HASH, value: hash }, update: { value: hash } }),
  ]);
}

export async function verifyRefLogin(username: string, password: string): Promise<boolean> {
  const cfg = await refLoginConfig();
  if (!cfg.hash) return false;
  const ok = await bcrypt.compare(password, cfg.hash);
  return ok && username.trim().toLowerCase() === cfg.username.toLowerCase();
}

export function issueRefCookie(res: Response, username: string) {
  const token = jwt.sign({ role: "referee", username }, env.jwtSecret, { expiresIn: "18h" });
  res.cookie(COOKIE, token, { httpOnly: true, secure: env.isProd, sameSite: "lax", maxAge: 18 * 3600 * 1000, path: "/" });
}

export function clearRefCookie(res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
}

export function refFromToken(token: string | undefined): { username: string } | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, env.jwtSecret) as { role: string; username: string };
    return p.role === "referee" ? { username: p.username } : null;
  } catch {
    return null;
  }
}

export const getRefSession = (req: Request) => refFromToken(req.cookies?.[COOKIE]);
export const REF_COOKIE = COOKIE;
