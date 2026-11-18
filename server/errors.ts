import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { EngineError } from "@shared/scoring/types";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const notFound = (what = "Not found") => new HttpError(404, what);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;
/** Wrap an async route so thrown errors reach the error handler. */
export const ah = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  if (err instanceof EngineError) return res.status(400).json({ error: err.message });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  const e = err as { code?: string; message?: string };
  if (e?.code === "P2002") return res.status(409).json({ error: "Already exists (duplicate value)" });
  if (e?.code === "P2025") return res.status(404).json({ error: "Not found" });
  if (e?.code === "P2003") return res.status(409).json({ error: "In use by other records" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
