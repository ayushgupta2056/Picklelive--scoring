import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { prisma } from "./db";
import { env } from "./env";
import { ah, errorHandler } from "./errors";
import { clearAdminCookie, getAdmin, issueAdminCookie, requireAdmin, verifyAdmin } from "./auth";
import { publicRouter } from "./routes/public";
import { refRouter, refSessionRouter } from "./routes/ref";
import { clearRefCookie, getRefSession, issueRefCookie, verifyRefLogin } from "./refSession";
import { adminRouter } from "./routes/admin";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "img-src": ["'self'", "data:", "blob:"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "font-src": ["'self'", "data:"],
          "connect-src": ["'self'", "ws:", "wss:"],
          "script-src": ["'self'"],
          "worker-src": ["'self'"],
          "manifest-src": ["'self'"],
          "upgrade-insecure-requests": env.isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "3mb" }));

  // Health check for Render.
  app.get("/healthz", ah(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, time: new Date().toISOString() });
  }));

  // CSRF / CORS lock: state-changing API calls must come from the app's own origin.
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (!origin) return next(); // same-origin non-browser clients (curl, tests)
    const host = `${req.protocol}://${req.get("host")}`;
    const allowed = new Set([host, env.appOrigin].filter(Boolean));
    if (!env.isProd) ["http://localhost:5173", "http://127.0.0.1:5173"].forEach((o) => allowed.add(o));
    if (!allowed.has(origin)) return res.status(403).json({ error: "Cross-origin request blocked" });
    next();
  });

  const loginLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many login attempts, try again in a minute" } });
  const refLimiter = rateLimit({ windowMs: 60_000, limit: 1200, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests" } });
  const adminLimiter = rateLimit({ windowMs: 60_000, limit: 2000, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests" } });

  app.post("/api/auth/login", loginLimiter, ah(async (req, res) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).parse(req.body);
    if (!(await verifyAdmin(email, password))) return res.status(401).json({ error: "Wrong email or password" });
    issueAdminCookie(res);
    res.json({ ok: true, email: email.toLowerCase() });
  }));
  app.post("/api/auth/logout", (_req, res) => {
    clearAdminCookie(res);
    res.json({ ok: true });
  });
  app.get("/api/auth/me", (req, res) => {
    const a = getAdmin(req);
    const r = getRefSession(req);
    res.json({ admin: !!a, email: a?.email, referee: !!r, refUsername: r?.username });
  });
  // Shared referee login (one username/password for all referees).
  app.post("/api/auth/ref-login", loginLimiter, ah(async (req, res) => {
    const { username, password } = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) }).parse(req.body);
    if (!(await verifyRefLogin(username, password))) return res.status(401).json({ error: "Wrong referee username or password" });
    issueRefCookie(res, username.trim());
    res.json({ ok: true, username: username.trim() });
  }));
  app.post("/api/auth/ref-logout", (_req, res) => {
    clearRefCookie(res);
    res.json({ ok: true });
  });

  app.use("/api/public", publicRouter);
  app.use("/api/media", (req, _res, next) => {
    req.url = `/media${req.url}`;
    next();
  }, publicRouter);
  app.use("/api/ref-session", refLimiter, refSessionRouter);
  app.use("/api/ref", refLimiter, refRouter);
  app.use("/api/admin", adminLimiter, requireAdmin, adminRouter);
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  // Static SPA
  const clientDir = path.resolve(process.cwd(), "dist/client");
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir, {
      index: false,
      setHeaders: (res, file) => {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        else res.setHeader("Cache-Control", "no-cache");
      },
    }));
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(clientDir, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
