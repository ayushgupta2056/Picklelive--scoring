import { Router } from "express";
import { prisma } from "../db";
import { ah, notFound } from "../errors";
import { buildBundle, loadTournamentBySlug } from "../services/bundle";
import { matchSummary, stateOf } from "../services/serialize";
import type { MatchConfig } from "@shared/scoring/types";
import type { MatchDetail } from "@shared/api";

export const publicRouter = Router();

publicRouter.get("/tournaments", ah(async (_req, res) => {
  const list = await prisma.tournament.findMany({ where: { published: true }, orderBy: { startDate: "desc" } });
  res.json(list.map((t) => ({ id: t.id, slug: t.slug, name: t.name, venue: t.venue, startDate: t.startDate, endDate: t.endDate, logoUrl: t.logoMediaId ? `/api/media/${t.logoMediaId}` : null })));
}));

publicRouter.get("/t/:slug", ah(async (req, res) => {
  const t = await loadTournamentBySlug(String(req.params.slug));
  res.set("Cache-Control", "no-store");
  res.json(await buildBundle(t.id));
}));

publicRouter.get("/matches/:id", ah(async (req, res) => {
  const m = await prisma.match.findUnique({ where: { id: String(req.params.id) }, include: { lineups: true, tie: { include: { template: true } } } });
  if (!m) throw notFound("Match not found");
  const detail: MatchDetail = {
    match: matchSummary(m, m.tie, { blind: !!m.tie.template?.blindLineup }),
    state: stateOf(m),
    config: m.config as unknown as MatchConfig,
  };
  res.set("Cache-Control", "no-store");
  res.json(detail);
}));

publicRouter.get("/media/:id", ah(async (req, res) => {
  const media = await prisma.media.findUnique({ where: { id: String(req.params.id) } });
  if (!media) throw notFound();
  res.set("Content-Type", media.mime);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(Buffer.from(media.data));
}));
