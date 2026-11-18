import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../db";
import { ah, HttpError, notFound } from "../errors";
import { tokenMatches } from "../tokens";
import { incomingEventSchema, lineupSchema } from "../validation";
import { appendEvent, audit } from "../services/matchService";
import { saveLineup, setLineupLock, tieLineups } from "../services/lineupService";
import { matchSummary, pubCategory, pubPlayer, pubTeam, pubTournament, stateOf, tieSummary } from "../services/serialize";
import type { RefBundle } from "@shared/api";
import type { EngineEvent, MatchConfig } from "@shared/scoring/types";
import { getAdmin } from "../auth";

export const refRouter = Router();

/** Ref tokens are scoped to exactly one match. The admin cookie is also accepted. */
async function refAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const matchId = String(req.params.matchId);
    const token = String(req.get("x-ref-token") ?? req.query.token ?? "");
    const m = await prisma.match.findUnique({ where: { id: matchId }, select: { refTokenHash: true } });
    if (!m) throw notFound("Match not found");
    const admin = getAdmin(req);
    if (tokenMatches(token, m.refTokenHash)) res.locals.actor = `ref:${matchId}`;
    else if (admin) res.locals.actor = `admin:${admin.email}`;
    else throw new HttpError(401, "This referee link is invalid or has been revoked");
    res.locals.isAdmin = !!admin && !tokenMatches(token, m.refTokenHash);
    next();
  } catch (e) {
    next(e);
  }
}

export async function buildRefBundle(matchId: string): Promise<RefBundle> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: { events: { orderBy: { seq: "asc" } }, lineups: true, category: true, tie: { include: { template: true, matches: { include: { lineups: true } }, teamA: true, teamB: true } }, tournament: true },
  });
  if (!m) throw notFound("Match not found");
  const teamIds = [m.tie.teamAId, m.tie.teamBId].filter(Boolean) as string[];
  const players = await prisma.player.findMany({ where: { teamId: { in: teamIds } } });
  const lineups = await tieLineups(m.tieId, m.id);
  return {
    tournament: pubTournament(m.tournament),
    tie: tieSummary(m.tie, { revealAll: true }),
    match: matchSummary(m, m.tie, { revealAll: true }),
    state: stateOf(m),
    config: m.config as unknown as MatchConfig,
    category: pubCategory(m.category),
    teamA: m.tie.teamA ? pubTeam(m.tie.teamA) : null,
    teamB: m.tie.teamB ? pubTeam(m.tie.teamB) : null,
    players: players.map((p) => pubPlayer(p, m.tournament.ageCutoffDate)),
    lineups: lineups.slots[0],
    events: m.events.map((e) => ({ type: e.type, payload: e.payload, at: e.createdAt.toISOString() }) as EngineEvent),
    refSubmitted: m.refSubmitted,
  };
}

refRouter.get("/:matchId", refAuth, ah(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await buildRefBundle(String(req.params.matchId)));
}));

refRouter.put("/:matchId/lineup", refAuth, ah(async (req, res) => {
  const body = lineupSchema.parse(req.body);
  const v = await saveLineup(String(req.params.matchId), body, res.locals.actor, !!res.locals.isAdmin);
  res.json({ ok: true, validation: v });
}));

refRouter.post("/:matchId/lineups/lock", refAuth, ah(async (req, res) => {
  await setLineupLock(String(req.params.matchId), true, res.locals.actor);
  res.json({ ok: true });
}));

refRouter.post("/:matchId/events", refAuth, ah(async (req, res) => {
  const body = incomingEventSchema.parse(req.body);
  const r = await appendEvent(String(req.params.matchId), { seq: body.seq, idempotencyKey: body.idempotencyKey, type: body.event.type, payload: body.event.payload as Record<string, unknown> }, res.locals.actor);
  res.json(r);
}));

refRouter.post("/:matchId/submit", refAuth, ah(async (req, res) => {
  const id = String(req.params.matchId);
  const m = await prisma.match.findUniqueOrThrow({ where: { id } });
  if (!["FINISHED", "RETIRED", "WALKOVER"].includes(m.status)) throw new HttpError(409, "Match is not finished yet");
  await prisma.match.update({ where: { id }, data: { refSubmitted: true } });
  await audit(res.locals.actor, "match.submit_final", "Match", id, { gamesA: m.gamesA, gamesB: m.gamesB, winner: m.winner }, m.tournamentId);
  res.json({ ok: true });
}));
