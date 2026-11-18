import { prisma } from "../db";
import { notFound } from "../errors";
import type { CategoryBoard, GroupStandings, PublicStage, TieSummary, TournamentBundle } from "@shared/api";
import { computeStandings, type StandingTieInput } from "@shared/tournament/standings";
import { pubCategory, pubPlayer, pubTeam, pubTournament, settingsOf, tieSummary } from "./serialize";

export async function loadTournamentBySlug(slug: string) {
  const t = await prisma.tournament.findUnique({ where: { slug } });
  if (!t) throw notFound("Tournament not found");
  return t;
}

export function standingsFor(
  stages: PublicStage[],
  ties: TieSummary[],
  points: { win: number; draw: number; loss: number },
  order: TournamentBundle["tournament"]["settings"]["tiebreakOrder"],
): GroupStandings[] {
  const out: GroupStandings[] = [];
  for (const st of stages.filter((s) => s.type === "ROUND_ROBIN")) {
    for (const g of st.groups) {
      const groupTies: StandingTieInput[] = ties
        .filter((t) => t.groupId === g.id && t.teamAId && t.teamBId)
        .map((t) => ({
          id: t.id,
          teamAId: t.teamAId!,
          teamBId: t.teamBId!,
          finished: t.status === "FINISHED",
          winner: t.winner,
          matches: t.matches.map((m) => ({ winner: m.winner, games: m.games.filter((x) => x.winner) })),
        }));
      out.push({
        stageId: st.id,
        groupId: g.id,
        qualifiers: st.settings.qualifiersPerGroup ?? 2,
        rows: computeStandings(g.teamIds, groupTies, points, order),
      });
    }
  }
  return out;
}

function categoryBoards(ties: TieSummary[]): CategoryBoard[] {
  const boards = new Map<string, CategoryBoard>();
  for (const t of ties) {
    for (const m of t.matches) {
      if (!m.winner || !t.teamAId || !t.teamBId) continue;
      const b = boards.get(m.categoryId) ?? { categoryId: m.categoryId, teams: [], pairs: [] };
      boards.set(m.categoryId, b);
      const pf = { A: m.games.reduce((n, g) => n + g.a, 0), B: m.games.reduce((n, g) => n + g.b, 0) };
      for (const side of ["A", "B"] as const) {
        const teamId = side === "A" ? t.teamAId : t.teamBId;
        const won = m.winner === side;
        let tr = b.teams.find((x) => x.teamId === teamId);
        if (!tr) b.teams.push((tr = { teamId, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 }));
        tr.won += won ? 1 : 0;
        tr.lost += won ? 0 : 1;
        tr.pointsFor += pf[side];
        tr.pointsAgainst += pf[side === "A" ? "B" : "A"];
        const lineup = side === "A" ? m.lineupA : m.lineupB;
        if (!lineup?.length) continue;
        const k = [...lineup].sort().join("+");
        let pr = b.pairs.find((x) => [...x.playerIds].sort().join("+") === k);
        if (!pr) b.pairs.push((pr = { playerIds: lineup, teamId, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 }));
        pr.won += won ? 1 : 0;
        pr.lost += won ? 0 : 1;
        pr.pointsFor += pf[side];
        pr.pointsAgainst += pf[side === "A" ? "B" : "A"];
      }
    }
  }
  const rank = <T extends { won: number; lost: number; pointsFor: number; pointsAgainst: number }>(a: T, b: T) =>
    b.won - a.won || a.lost - b.lost || b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst);
  for (const b of boards.values()) {
    b.teams.sort(rank);
    b.pairs.sort(rank);
  }
  return [...boards.values()];
}

export async function buildBundle(tournamentId: string, opts: { revealAll?: boolean } = {}): Promise<TournamentBundle> {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) throw notFound("Tournament not found");
  const [categories, teams, players, stages, ties] = await Promise.all([
    prisma.category.findMany({ where: { tournamentId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.team.findMany({ where: { tournamentId }, orderBy: { name: "asc" } }),
    prisma.player.findMany({ where: { tournamentId }, orderBy: { name: "asc" } }),
    prisma.stage.findMany({ where: { tournamentId }, orderBy: { order: "asc" }, include: { groups: { include: { teams: true }, orderBy: { order: "asc" } } } }),
    prisma.tie.findMany({
      where: { tournamentId },
      include: { matches: { include: { lineups: true } }, template: true },
      orderBy: [{ round: "asc" }, { bracketPos: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const pubStages: PublicStage[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    order: s.order,
    templateId: s.templateId,
    settings: (s.settings as PublicStage["settings"]) ?? {},
    groups: s.groups.map((g) => ({ id: g.id, name: g.name, order: g.order, teamIds: [...g.teams].sort((a, b) => a.seed - b.seed).map((x) => x.teamId) })),
  }));
  const tieSummaries = ties.map((x) => tieSummary(x, opts));
  const settings = settingsOf(t);
  return {
    tournament: pubTournament(t),
    categories: categories.map(pubCategory),
    teams: teams.map(pubTeam),
    players: players.map((p) => pubPlayer(p, t.ageCutoffDate)),
    stages: pubStages,
    ties: tieSummaries,
    standings: standingsFor(pubStages, tieSummaries, { win: settings.pointsWin, draw: settings.pointsDraw, loss: settings.pointsLoss }, settings.tiebreakOrder),
    categoryBoards: categoryBoards(tieSummaries),
    generatedAt: new Date().toISOString(),
  };
}
