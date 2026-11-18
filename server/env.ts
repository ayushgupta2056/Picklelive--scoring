import "dotenv/config";

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v == null || v === "") throw new Error(`Missing required env var ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === "production";

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: req("DATABASE_URL"),
  adminEmail: req("ADMIN_EMAIL", isProd ? undefined : "admin@picklelive.local").toLowerCase(),
  adminPassword: req("ADMIN_PASSWORD", isProd ? undefined : "changeme123"),
  jwtSecret: req("JWT_SECRET", isProd ? undefined : "dev-secret-change-me"),
  /** Optional default for the shared referee login (the admin can set/change it in Settings instead). */
  refUsername: process.env.REF_USERNAME || (isProd ? "" : "referee"),
  refPassword: process.env.REF_PASSWORD || (isProd ? "" : "ref12345"),
  /** Public origin. Render sets RENDER_EXTERNAL_URL automatically. */
  appOrigin: (process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, ""),
};
