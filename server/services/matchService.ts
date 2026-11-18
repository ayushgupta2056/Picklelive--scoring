import type { Prisma, MatchStatus } from "@prisma/client";
import { prisma } from "../db";
import { HttpError, notFound } from "../errors";
import { tryAppend, replay } from "@shared/scoring/engine";
import type { EngineEvent, MatchConfig, MatchState, Side } from "@shared/scoring/types";
import { computeTie, type TieRules } from "@shared/tie/tieEngine";
import { emitInvalidate, emitMatch, emitTie } from "../realtime";
import { matchSummary, resolveConfig, tieSummary } from "./serialize";
import { freshRefToken } from "../tokens";

type Tx = Prisma.TransactionClient;

export async function audit(
  actor: string,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
  tournamentId: string | null = null,
  tx: Tx | typeof prisma = prisma,
) {
  await tx.auditLog.create({ data: { actor, action, entity, entityId, details: details as Prisma.InputJsonValue, tournamentId } });
}

export interface IncomingEvent {
  seq: number;
  idempotencyKey: string;
  type: EngineEvent["type"];
  payload?: Record<string, unknown>;
}

function statusFromState(state: MatchState, current: MatchStatus, hasLineup: boolean): MatchStatus {
  if (state.phase === "FINISHED") {
    if (state.resultType === "RETIRED") return "RETIRED";
    if (state.resultType === "FORFEIT") return "WALKOVER";
    return "FINISHED";
  }
  if (state.phase === "NOT_STARTED") return hasLineup ? "LINEUP" : "SCHEDULED";
  return current === "PAUSED" ? "PAUSED" : "LIVE";
}

const toEngine = (e: { type: string; payload: unknown; createdAt: Date }): EngineEvent =>
  ({ type: e.type, payload: e.payload ?? {}, at: e.createdAt.toISOString() }) as EngineEvent;

export class SeqConflict extends HttpError {
  constructor(expected: number, state: MatchState) {
    super(409, `Out of order: expected seq ${expected}`, { expectedSeq: expected, state });
  }
}

/**
 * Append a score event inside a transaction with a row lock on the match, so two devices can never
 * interleave writes. Dedupes by idempotency key and rejects out-of-order sequence numbers.
 */
export async function appendEvent(matchId: string, ev: IncomingEvent, actor: string) {
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { lineups: true, tie: true, events: { orderBy: { seq: "asc" } } },
      });
      if (!match) throw notFound("Match not found");
      const config = match.config as unknown as MatchConfig;
      const dup = match.events.find((e) => e.idempotencyKey === ev.idempotencyKey);
      if (dup) return { duplicate: true as const, match, state: replay(config, match.events.map(toEngine)) };
      const existing = match.events.map(toEngine);
      if (ev.seq !== match.seq + 1) throw new SeqConflict(match.seq + 1, replay(config, existing));
      if (match.status === "NOT_REQUIRED") throw new HttpError(409, "This match is not required");
      if (match.status === "PAUSED" && ev.type === "RALLY") throw new HttpError(409, "Match is paused by the admin");

      const now = new Date();
      const engineEv = { type: ev.type, payload: ev.payload ?? {}, at: now.toISOString() } as EngineEvent;

      if (ev.type === "SETUP") {
        const { tie } = match;
        if (!tie.teamAId || !tie.teamBId) throw new HttpError(409, "Both teams must be known");
        const la = match.lineups.find((l) => l.teamId === tie.teamAId);
        const lb = match.lineups.find((l) => l.teamId === tie.teamBId);
        const need = config.format === "DOUBLES" ? 2 : 1;
        if (!la?.submittedAt || !lb?.submittedAt || la.playerIds.length !== need || lb.playerIds.length !== need)
          throw new HttpError(409, "Both lineups must be submitted before the match can start");
        const p = (ev.payload ?? {}) as { positions?: { A?: { right?: string; left?: string | null }; B?: { right?: string; left?: string | null } } };
        for (const [side, l] of [["A", la], ["B", lb]] as const) {
          const pos = p.positions?.[side];
          const ids = [pos?.right, pos?.left].filter(Boolean).sort();
          if (ids.join() !== [...l.playerIds].sort().join()) throw new HttpError(400, `Team ${side} positions must use its locked lineup`);
        }
      }

      const state = tryAppend(config, existing, engineEv);
      await tx.scoreEvent.create({
        data: { matchId, seq: ev.seq, type: ev.type, payload: (ev.payload ?? {}) as Prisma.InputJsonValue, idempotencyKey: ev.idempotencyKey, actor },
      });
      if (ev.type === "SETUP") {
        // Lineups auto-lock at the first serve.
        await tx.matchLineup.updateMany({ where: { matchId }, data: { locked: true } });
      }
      const hasLineup = match.lineups.some((l) => l.submittedAt);
      const status = statusFromState(state, match.status, hasLineup);
      const updated = await tx.match.update({
        where: { id: matchId },
        data: {
          seq: ev.seq,
          cachedState: state as unknown as Prisma.InputJsonValue,
          status,
          winner: state.phase === "FINISHED" ? state.winner : null,
          gamesA: state.gamesWon.A,
          gamesB: state.gamesWon.B,
          startedAt: match.startedAt ?? (state.phase !== "NOT_STARTED" ? now : null),
          finishedAt: state.phase === "FINISHED" ? (match.finishedAt ?? now) : null,
          refSubmitted: state.phase === "FINISHED" ? match.refSubmitted : false,
        },
        include: { lineups: true },
      });
      if (ev.type === "ADMIN_SET_RESULT" || ev.type === "FORFEIT" || ev.type === "RETIRE" || ev.type === "END_GAME") {
        await audit(actor, `match.${ev.type.toLowerCase()}`, "Match", matchId, { payload: ev.payload }, match.tournamentId, tx);
      }
      return { duplicate: false as const, match: { ...updated, tie: match.tie }, state, statusChanged: status !== match.status };
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );

  const m = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, include: { lineups: true, tie: { include: { template: true } } } });
  const summary = matchSummary(m, m.tie, { blind: !!m.tie.template?.blindLineup });
  if (!result.duplicate) {
    emitMatch(m.tournamentId, summary, result.state);
    if (result.statusChanged || ["FINISHED", "WALKOVER", "RETIRED"].includes(m.status) || ev.type === "UNDO") await recomputeTie(m.tieId);
  }
  return { duplicate: result.duplicate, seq: m.seq, state: result.state, summary };
}

export function rulesFor(template: { levelPolicy: string; stopEarly: boolean; earlyStopMode: string } | null | undefined): TieRules {
  return {
    levelPolicy: template?.levelPolicy === "DRAW" ? "DRAW" : "DECIDER",
    stopEarly: template?.stopEarly ?? true,
    earlyStopMode: template?.earlyStopMode === "DEAD_RUBBER" ? "DEAD_RUBBER" : "NOT_REQUIRED",
  };
}

/** Recompute a tie's score/status from its matches, mark matches not required, and feed knockout winners forward. */
export async function recomputeTie(tieId: string, opts: { silent?: boolean } = {}) {
  const tie = await prisma.tie.findUnique({ where: { id: tieId }, include: { matches: { include: { lineups: true } }, template: true } });
  if (!tie) return;
  const res = computeTie(
    tie.matches.map((m) => ({
      order: m.slotOrder,
      weight: m.weight,
      isDecider: m.isDecider,
      status: m.status === "NOT_REQUIRED" ? "SCHEDULED" : m.status,
      winner: (m.winner as Side | null) ?? null,
    })),
    rulesFor(tie.template),
  );
  const changedMatches: string[] = [];
  for (const m of tie.matches) {
    const shouldSkip = res.notRequired.includes(m.slotOrder);
    if (shouldSkip && (m.status === "SCHEDULED" || m.status === "LINEUP")) {
      await prisma.match.update({ where: { id: m.id }, data: { status: "NOT_REQUIRED" } });
      changedMatches.push(m.id);
    } else if (!shouldSkip && m.status === "NOT_REQUIRED") {
      await prisma.match.update({ where: { id: m.id }, data: { status: m.lineups.some((l) => l.submittedAt) ? "LINEUP" : "SCHEDULED" } });
      changedMatches.push(m.id);
    }
  }
  const winner = res.winner;
  const prevWinner = tie.winner;
  const updated = await prisma.tie.update({
    where: { id: tieId },
    data: { scoreA: res.scoreA, scoreB: res.scoreB, status: res.status, winner },
    include: { matches: { include: { lineups: true } }, template: true },
  });

  // Knockout propagation (only once the winner is known; cleared again if the result is undone).
  const decided = winner === "A" || winner === "B";
  const winnerTeam = winner === "A" ? tie.teamAId : winner === "B" ? tie.teamBId : null;
  const loserTeam = winner === "A" ? tie.teamBId : winner === "B" ? tie.teamAId : null;
  const touched: string[] = [];
  const place = async (targetId: string | null, side: string | null, teamId: string | null) => {
    if (!targetId || !side) return;
    const target = await prisma.tie.findUnique({ where: { id: targetId }, include: { matches: true } });
    if (!target) return;
    const started = target.matches.some((m) => m.status === "LIVE" || m.status === "FINISHED" || m.seq > 0);
    if (started) return;
    const field = side === "A" ? "teamAId" : "teamBId";
    if (target[field] === teamId) return;
    await prisma.tie.update({ where: { id: targetId }, data: { [field]: teamId } });
    touched.push(targetId);
  };
  if (decided || prevWinner) {
    await place(tie.nextTieId, tie.nextSide, decided ? winnerTeam : null);
    await place(tie.loserNextTieId, tie.loserNextSide, decided ? loserTeam : null);
  }

  if (opts.silent) return updated;
  emitTie(tie.tournamentId, tieSummary(updated));
  for (const id of changedMatches) {
    const m = updated.matches.find((x) => x.id === id);
    if (m) emitMatch(tie.tournamentId, matchSummary(m, updated, { blind: !!updated.template?.blindLineup }));
  }
  if (prevWinner !== winner || touched.length || tie.status !== res.status) emitInvalidate(tie.tournamentId, "tie-result");
  return updated;
}

/** Create the matches of a tie from a list of slots. */
export async function createMatchesForTie(
  tx: Tx,
  tie: { id: string; tournamentId: string; court?: string | null; scheduledAt?: Date | null },
  slots: { order: number; categoryId: string; weight: number; isDecider: boolean }[],
  durationMin = 30,
) {
  const cats = await tx.category.findMany({ where: { id: { in: slots.map((s) => s.categoryId) } } });
  for (const s of slots) {
    const cat = cats.find((c) => c.id === s.categoryId);
    if (!cat) throw new HttpError(400, "Unknown category in tie format");
    const { refTokenHash, refTokenEnc } = freshRefToken();
    await tx.match.create({
      data: {
        tournamentId: tie.tournamentId,
        tieId: tie.id,
        categoryId: cat.id,
        slotOrder: s.order,
        weight: s.weight,
        isDecider: s.isDecider,
        config: resolveConfig(cat) as unknown as Prisma.InputJsonValue,
        court: tie.court ?? null,
        scheduledAt: tie.scheduledAt ?? null,
        durationMin,
        refTokenHash,
        refTokenEnc,
      },
    });
  }
}

export async function loadTieSummary(tieId: string, revealAll = false) {
  const t = await prisma.tie.findUnique({ where: { id: tieId }, include: { matches: { include: { lineups: true } }, template: true } });
  if (!t) throw notFound("Tie not found");
  return tieSummary(t, { revealAll });
}
