import { prisma } from "../db";
import { HttpError, notFound } from "../errors";
import { checkPlayer, validateLineup, ageGroupLabel, type EligPlayer } from "@shared/eligibility/eligibility";
import type { SlotLineupInfo, TieLineups } from "@shared/api";
import type { Side } from "@shared/scoring/types";
import { audit, recomputeTie } from "./matchService";
import { categoryRules, isoDate, matchSummary } from "./serialize";
import { emitMatch } from "../realtime";

async function loadTie(tieId: string) {
  const tie = await prisma.tie.findUnique({
    where: { id: tieId },
    include: { matches: { include: { lineups: true, category: true } }, template: true, tournament: true },
  });
  if (!tie) throw notFound("Tie not found");
  return tie;
}

const toElig = (p: { id: string; name: string; gender: "MALE" | "FEMALE"; dob: Date | null; skill: number | null; teamId: string | null }): EligPlayer => ({
  id: p.id,
  name: p.name,
  gender: p.gender,
  dob: isoDate(p.dob),
  skill: p.skill,
  teamId: p.teamId ?? "",
});

/** Eligibility for every slot of a tie, per team. `onlyMatchId` narrows to one match (referee view). */
export async function tieLineups(tieId: string, onlyMatchId?: string): Promise<TieLineups> {
  const tie = await loadTie(tieId);
  const teamIds = [tie.teamAId, tie.teamBId].filter(Boolean) as string[];
  const players = await prisma.player.findMany({ where: { teamId: { in: teamIds } }, orderBy: { name: "asc" } });
  const cutoff = isoDate(tie.tournament.ageCutoffDate)!;
  const usageLimit = tie.template?.usageLimit ?? 2;
  const allowPairRepeat = tie.template?.allowPairRepeat ?? false;

  const slots: SlotLineupInfo[] = [];
  for (const m of [...tie.matches].sort((a, b) => a.slotOrder - b.slotOrder)) {
    if (onlyMatchId && m.id !== onlyMatchId) continue;
    const rules = categoryRules(m.category);
    const teams: SlotLineupInfo["teams"] = [];
    for (const [side, teamId] of [["A", tie.teamAId], ["B", tie.teamBId]] as [Side, string | null][]) {
      if (!teamId) continue;
      const lineup = m.lineups.find((l) => l.teamId === teamId);
      const roster = players.filter((p) => p.teamId === teamId);
      const otherLineups = tie.matches
        .filter((x) => x.id !== m.id && x.status !== "NOT_REQUIRED")
        .map((x) => x.lineups.find((l) => l.teamId === teamId)?.playerIds ?? [])
        .filter((l) => l.length);
      const ctx = {
        cutoffDate: cutoff,
        teamId,
        rosterIds: roster.map((p) => p.id),
        usage: { usageLimit, allowPairRepeat, otherLineups },
        overrides: lineup?.overridePlayerIds ?? [],
      };
      teams.push({
        side,
        teamId,
        playerIds: lineup?.playerIds ?? [],
        locked: !!lineup?.locked,
        submitted: !!lineup?.submittedAt,
        overrideReason: lineup?.overrideReason ?? null,
        overridePlayerIds: lineup?.overridePlayerIds ?? [],
        roster: roster.map((p) => {
          const r = checkPlayer(toElig(p), rules, { ...ctx, overrides: [] });
          return {
            id: p.id,
            name: p.name,
            gender: p.gender,
            ageGroup: ageGroupLabel(isoDate(p.dob), cutoff),
            jersey: p.jersey,
            eligible: r.eligible,
            reasons: r.reasons,
          };
        }),
      });
    }
    slots.push({ matchId: m.id, categoryId: m.categoryId, slotOrder: m.slotOrder, status: m.status, teams });
  }
  return { tieId, blind: !!tie.template?.blindLineup, usageLimit, allowPairRepeat, slots };
}

export interface LineupInput {
  teamId: string;
  playerIds: string[];
  overridePlayerIds?: string[];
  overrideReason?: string | null;
}

export async function saveLineup(matchId: string, input: LineupInput, actor: string, isAdmin: boolean) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { tie: true, category: true, lineups: true } });
  if (!match) throw notFound("Match not found");
  const { tie } = match;
  if (input.teamId !== tie.teamAId && input.teamId !== tie.teamBId) throw new HttpError(400, "Team is not part of this tie");
  const existing = match.lineups.find((l) => l.teamId === input.teamId);
  if (existing?.locked) throw new HttpError(409, "Lineup is locked. The admin must unlock it first.");
  if (match.status === "LIVE" || match.status === "FINISHED") throw new HttpError(409, "Match already started");

  const overrides = input.overridePlayerIds ?? [];
  if (overrides.length && !isAdmin) throw new HttpError(403, "Only the admin can override eligibility");
  if (overrides.length && !input.overrideReason?.trim()) throw new HttpError(400, "An override needs a reason");

  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id: match.tournamentId } });
  const template = tie.templateId ? await prisma.tieTemplate.findUnique({ where: { id: tie.templateId } }) : null;
  const roster = await prisma.player.findMany({ where: { teamId: input.teamId } });
  const picked = input.playerIds.map((id) => roster.find((p) => p.id === id));
  if (picked.some((p) => !p)) {
    // allow an admin override to include a player from outside the roster only if it exists in the tournament
    if (!isAdmin) throw new HttpError(400, "Player not in roster");
  }
  const allPlayers = await prisma.player.findMany({ where: { id: { in: input.playerIds }, tournamentId: match.tournamentId } });
  if (allPlayers.length !== new Set(input.playerIds).size) throw new HttpError(400, "Unknown player");
  const others = await prisma.matchLineup.findMany({
    where: { teamId: input.teamId, match: { tieId: tie.id, id: { not: matchId }, status: { not: "NOT_REQUIRED" } } },
  });
  const v = validateLineup(input.playerIds.map((id) => toElig(allPlayers.find((p) => p.id === id)!)), categoryRules(match.category), {
    cutoffDate: isoDate(tournament.ageCutoffDate)!,
    teamId: input.teamId,
    rosterIds: roster.map((p) => p.id),
    usage: { usageLimit: template?.usageLimit ?? 2, allowPairRepeat: template?.allowPairRepeat ?? false, otherLineups: others.map((o) => o.playerIds) },
    overrides,
  });
  if (!v.valid) throw new HttpError(422, "Lineup not eligible", { errors: v.errors, players: v.players });

  await prisma.matchLineup.upsert({
    where: { matchId_teamId: { matchId, teamId: input.teamId } },
    create: { matchId, teamId: input.teamId, playerIds: input.playerIds, overridePlayerIds: overrides, overrideReason: input.overrideReason ?? null, submittedAt: new Date(), submittedBy: actor },
    update: { playerIds: input.playerIds, overridePlayerIds: overrides, overrideReason: input.overrideReason ?? null, submittedAt: new Date(), submittedBy: actor },
  });
  if (match.status === "SCHEDULED") await prisma.match.update({ where: { id: matchId }, data: { status: "LINEUP" } });
  await audit(actor, overrides.length ? "lineup.override" : "lineup.submit", "Match", matchId, {
    teamId: input.teamId,
    playerIds: input.playerIds,
    overridePlayerIds: overrides,
    reason: input.overrideReason ?? null,
  }, match.tournamentId);
  await broadcastMatch(matchId);
  return v;
}

export async function setLineupLock(matchId: string, locked: boolean, actor: string, teamId?: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { lineups: true, tie: true } });
  if (!match) throw notFound("Match not found");
  if (locked) {
    const need = (match.config as { format?: string }).format === "SINGLES" ? 1 : 2;
    const relevant = match.lineups.filter((l) => !teamId || l.teamId === teamId);
    const expected = teamId ? 1 : 2;
    if (relevant.length < expected || relevant.some((l) => l.playerIds.length !== need)) throw new HttpError(409, "Lineup incomplete");
  }
  await prisma.matchLineup.updateMany({ where: { matchId, ...(teamId ? { teamId } : {}) }, data: { locked } });
  await audit(actor, locked ? "lineup.lock" : "lineup.unlock", "Match", matchId, { teamId: teamId ?? "both" }, match.tournamentId);
  await broadcastMatch(matchId);
}

export async function broadcastMatch(matchId: string) {
  const m = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, include: { lineups: true, tie: { include: { template: true } } } });
  emitMatch(m.tournamentId, matchSummary(m, m.tie, { blind: !!m.tie.template?.blindLineup }));
  return m;
}

export { recomputeTie };
