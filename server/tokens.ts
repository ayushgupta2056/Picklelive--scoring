import crypto from "node:crypto";
import { env } from "./env";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Random 32-character URL-safe token. */
export function newRefToken(): string {
  const bytes = crypto.randomBytes(32);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, hash: string | null | undefined): boolean {
  if (!hash || !token) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const key = crypto.createHash("sha256").update(`${env.jwtSecret}:ref-token`).digest();

/** Tokens are stored hashed for verification, plus encrypted so the admin can re-display the link. */
export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptToken(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function freshRefToken() {
  const token = newRefToken();
  return { token, refTokenHash: hashToken(token), refTokenEnc: encryptToken(token) };
}
