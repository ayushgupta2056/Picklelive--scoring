import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../db";
import type { Prisma } from "@prisma/client";
import { ah, HttpError, notFound } from "../errors";
import { tokenMatches } from "../tokens";
import { incomingEventSchema, lineupSchema } from "../validation";
import { appendEvent, audit } from "../services/matchService";
import { broadcastMatch, saveLineup, setLineupLock, tieLineups } from "../services/lineupService";
import { emitInvalidate } from "../realtime";
import { z } from "zod";
import { resolveConfig, matchSummary, pubCategory, pubPlayer, pubTeam, pubTournament, stateOf, tieSummary } from "../services/serialize";
import type { RefBundle } from "@shared/api";
import type { EngineEvent, MatchConfig } from "@shared/scoring/types";
import { getAdmin } from "../auth";
import { getRefSession } from "../refSession";
import { busyConflicts, busyMessage } from "@shared/tie/teamBusy";
import { createMatchesForTie } from "../services/matchService";
import { slotsForTemplate } from "../services/stageService";
import { settingsOf } from "../services/serialize";

export const refRouter = Router();

/** Ref tokens are scoped to exactly one match. The admin cookie is also accepted. */
async function refAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const matchId = String(req.params.matchId);
    const token = String(req.get("x-ref-token") ?? req.query.token ?? "");
    const m = await prisma.match.findUnique({ where: { id: matchId }, select: { refTokenHash: true } });
    if (!m) throw notFound("Match not found");
    const admin = getAdmin(req);
    const refSession = getRefSession(req);
    if (tokenMatches(token, m.refTokenHash)) res.locals.actor = `ref:${matchId}`;
    else if (admin) res.locals.actor = `admin:${admin.email}`;
    else if (refSession) res.locals.actor = `referee:${refSession.username}`;
    else throw new HttpError(401, token ? "This referee link is invalid or has been revoked" : "Referee sign-in required");
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
  // one team, one tie at a time: tell the referee up front if either team is still busy in another tie
  let busy: string | null = null;
  if (m.tie.teamAId && m.tie.teamBId && m.seq === 0) {
    const others = await prisma.tie.findMany({
      where: { tournamentId: m.tournamentId, status: { not: "FINISHED" }, OR: [{ teamAId: { in: [m.tie.teamAId, m.tie.teamBId] } }, { teamBId: { in: [m.tie.teamAId, m.tie.teamBId] } }] },
      include: { matches: { select: { status: true, seq: true } }, teamA: true, teamB: true },
    });
    const c = busyConflicts(others, m.tieId);
    if (c.length) {
      const names = new Map(others.flatMap((o) => [o.teamA, o.teamB]).filter(Boolean).map((t) => [t!.id, t!.name]));
      busy = busyMessage(c, (id) => names.get(id ?? "") ?? "A team");
    }
  }
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
    busy,
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

/** The referee can set the court the match is played on (from the tournament's court list). */
refRouter.put("/:matchId/court", refAuth, ah(async (req, res) => {
  const id = String(req.params.matchId);
  const { court } = z.object({ court: z.string().min(1).max(40) }).parse(req.body);
  const m = await prisma.match.findUniqueOrThrow({ where: { id }, include: { tournament: true } });
  if (!m.tournament.courtNames.includes(court)) throw new HttpError(400, "Unknown court");
  await prisma.match.update({ where: { id }, data: { court } });
  await audit(res.locals.actor, "match.court", "Match", id, { from: m.court, to: court }, m.tournamentId);
  await broadcastMatch(id);
  emitInvalidate(m.tournamentId, "schedule");
  res.json({ ok: true });
}));

/** Before the first serve, the referee (or admin) can set how many games and points the match is played to. */
refRouter.put("/:matchId/format", refAuth, ah(async (req, res) => {
  const id = String(req.params.matchId);
  const body = z.object({ bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]), pointsToWin: z.union([z.literal(11), z.literal(15), z.literal(21)]).optional() }).parse(req.body);
  const m = await prisma.match.findUniqueOrThrow({ where: { id }, include: { category: true } });
  if (m.seq > 0) throw new HttpError(409, "The format can't change once the match has started");
  const override = { ...((m.configOverride as object) ?? {}), ...body };
  if (body.pointsToWin) {
    // keep timeouts / switch-ends consistent with the new game length unless explicitly overridden elsewhere
    Object.assign(override, { timeoutsPerGame: body.pointsToWin >= 21 ? 3 : 2, switchEndsAt: body.pointsToWin >= 21 ? 11 : body.pointsToWin >= 15 ? 8 : 6 });
  }
  await prisma.match.update({ where: { id }, data: { configOverride: override, config: resolveConfig(m.category, override) as unknown as Prisma.InputJsonValue } });
  await audit(res.locals.actor, "match.format", "Match", id, body, m.tournamentId);
  await broadcastMatch(id);
  res.json({ ok: true });
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

/**
 * Routes for referees signed in with the shared referee login. They pick teams, court and category
 * themselves; scoring then uses the normal /api/ref/:matchId endpoints (which accept the session).
 */
export const refSessionRouter = Router();
refSessionRouter.use((req, res, next) => {
  const r = getRefSession(req);
  const a = getAdmin(req);
  if (!r && !a) return res.status(401).json({ error: "Referee sign-in required" });
  res.locals.actor = r ? `referee:${r.username}` : `admin:${a!.email}`;
  next();
});

/** Start an extra (friendly) tie between two teams when none exists yet. */
refSessionRouter.post("/ties", ah(async (req, res) => {
  const b = z.object({ tournamentId: z.string(), teamAId: z.string(), teamBId: z.string() }).parse(req.body);
  if (b.teamAId === b.teamBId) throw new HttpError(400, "Pick two different teams");
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: b.tournamentId }, include: { stages: { orderBy: { order: "asc" } } } });
  const teams = await prisma.team.count({ where: { tournamentId: t.id, id: { in: [b.teamAId, b.teamBId] } } });
  if (teams !== 2) throw new HttpError(400, "Unknown team");
  const stage = t.stages[0];
  if (!stage) throw new HttpError(409, "The tournament has no stage yet; ask the admin to set one up");
  const templateId = stage.templateId ?? t.defaultTemplateId;
  const tie = await prisma.$transaction(async (tx) => {
    const slots = await slotsForTemplate(tx, templateId);
    const tie = await tx.tie.create({ data: { tournamentId: t.id, stageId: stage.id, teamAId: b.teamAId, teamBId: b.teamBId, templateId, roundLabel: "Extra tie" } });
    await createMatchesForTie(tx, tie, slots, settingsOf(t).matchDurationMinutes);
    return tie;
  });
  await audit(res.locals.actor, "tie.create_by_referee", "Tie", tie.id, b, t.id);
  emitInvalidate(t.id, "ties");
  res.status(201).json({ id: tie.id });
}));
