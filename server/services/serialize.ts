import type { Category, Match, MatchLineup, Player, Team, Tie, TieTemplate, Tournament } from "@prisma/client";
import {
  DEFAULT_SETTINGS,
  type LiveInfo,
  type MatchSummary,
  type PublicCategory,
  type PublicPlayer,
  type PublicTeam,
  type PublicTournament,
  type TieSummary,
  type TournamentSettings,
} from "@shared/api";
import { ageGroupLabel, describeAgeRule } from "@shared/eligibility/eligibility";
import { defaultConfig, initialState } from "@shared/scoring/engine";
import type { MatchConfig, MatchState } from "@shared/scoring/types";

export const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const mediaUrl = (id: string | null | undefined) => (id ? `/api/media/${id}` : null);

export function settingsOf(t: Pick<Tournament, "settings">): TournamentSettings {
  return { ...DEFAULT_SETTINGS, ...((t.settings as object) ?? {}) };
}

export function pubTournament(t: Tournament): PublicTournament {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    venue: t.venue,
    startDate: isoDate(t.startDate),
    endDate: isoDate(t.endDate),
    logoUrl: mediaUrl(t.logoMediaId),
    timezone: t.timezone,
    ageCutoffDate: isoDate(t.ageCutoffDate)!,
    courtNames: t.courtNames,
    settings: settingsOf(t),
  };
}

export function categoryRules(c: Category) {
  return {
    format: c.format,
    genderRule: c.genderRule,
    ageRule: { type: c.ageRuleType, min: c.ageMin, max: c.ageMax },
    skillMin: c.skillMin,
    skillMax: c.skillMax,
  };
}

export function pubCategory(c: Category): PublicCategory {
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    format: c.format,
    genderRule: c.genderRule,
    ageLabel: describeAgeRule({ type: c.ageRuleType, min: c.ageMin, max: c.ageMax }),
    color: c.color,
    icon: c.icon,
    sortOrder: c.sortOrder,
  };
}

export function pubTeam(t: Team): PublicTeam {
  return { id: t.id, name: t.name, code: t.code, color: t.color, logoUrl: mediaUrl(t.logoMediaId), captain: t.captain };
}

export function pubPlayer(p: Player, cutoff: Date): PublicPlayer {
  return {
    id: p.id,
    name: p.name,
    teamId: p.teamId,
    gender: p.gender,
    ageGroup: ageGroupLabel(isoDate(p.dob), isoDate(cutoff)!),
    photoUrl: mediaUrl(p.photoMediaId),
    jersey: p.jersey,
    handedness: p.handedness,
    skill: p.skill,
  };
}

export function resolveConfig(category: Category, override?: unknown): MatchConfig {
  return defaultConfig({
    ...((category.scoringConfig as Partial<MatchConfig>) ?? {}),
    ...((override as Partial<MatchConfig>) ?? {}),
    format: category.format,
  } as Partial<MatchConfig>);
}

export function stateOf(m: Pick<Match, "cachedState" | "config">): MatchState {
  return (m.cachedState as unknown as MatchState) ?? initialState(m.config as unknown as MatchConfig);
}

type MatchWithLineups = Match & { lineups: MatchLineup[] };

export function matchSummary(
  m: MatchWithLineups,
  tie: Pick<Tie, "teamAId" | "teamBId">,
  opts: { blind?: boolean; revealAll?: boolean } = {},
): MatchSummary {
  const st = m.cachedState as unknown as MatchState | null;
  const la = m.lineups.find((l) => l.teamId === tie.teamAId);
  const lb = m.lineups.find((l) => l.teamId === tie.teamBId);
  const bothIn = !!la?.submittedAt && !!lb?.submittedAt;
  const hide = opts.blind && !bothIn && !opts.revealAll;
  const lineup = (l?: MatchLineup) => (!l || !l.submittedAt || hide ? null : l.playerIds);
  let live: LiveInfo | null = null;
  if (st && st.phase !== "NOT_STARTED") {
    const g = st.games[st.gameIndex] ?? { a: 0, b: 0 };
    live = {
      phase: st.phase,
      call: st.call,
      servingTeam: st.servingTeam,
      serverId: st.serverId,
      serverNumber: st.serverNumber,
      gamePoint: st.gamePoint,
      matchPoint: st.matchPoint,
      switchEndsAlert: st.switchEndsAlert,
      score: { a: g.a, b: g.b },
      activeTimeout: st.activeTimeout,
    };
  }
  const games = st
    ? st.games.filter((g, i) => g.winner || g.a + g.b > 0 || (i === st.gameIndex && (st.phase === "IN_PROGRESS" || st.phase === "BETWEEN_GAMES")))
    : [];
  return {
    id: m.id,
    tieId: m.tieId,
    categoryId: m.categoryId,
    slotOrder: m.slotOrder,
    weight: m.weight,
    isDecider: m.isDecider,
    status: m.status,
    court: m.court,
    scheduledAt: m.scheduledAt?.toISOString() ?? null,
    durationMin: m.durationMin,
    winner: (m.winner as "A" | "B" | null) ?? null,
    gamesA: m.gamesA,
    gamesB: m.gamesB,
    games,
    live,
    lineupA: lineup(la),
    lineupB: lineup(lb),
    lineupALocked: !!la?.locked,
    lineupBLocked: !!lb?.locked,
    bestOf: (m.config as unknown as MatchConfig)?.bestOf ?? 3,
    seq: m.seq,
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function tieSummary(
  t: Tie & { matches: MatchWithLineups[]; template?: TieTemplate | null },
  opts: { revealAll?: boolean } = {},
): TieSummary {
  const blind = !!t.template?.blindLineup;
  return {
    id: t.id,
    stageId: t.stageId,
    groupId: t.groupId,
    round: t.round,
    roundLabel: t.roundLabel,
    bracketPos: t.bracketPos,
    teamAId: t.teamAId,
    teamBId: t.teamBId,
    templateId: t.templateId,
    status: t.status,
    scoreA: t.scoreA,
    scoreB: t.scoreB,
    winner: (t.winner as TieSummary["winner"]) ?? null,
    court: t.court,
    scheduledAt: t.scheduledAt?.toISOString() ?? null,
    nextTieId: t.nextTieId,
    nextSide: t.nextSide,
    matches: [...t.matches].sort((a, b) => a.slotOrder - b.slotOrder).map((m) => matchSummary(m, t, { blind, revealAll: opts.revealAll })),
  };
}
