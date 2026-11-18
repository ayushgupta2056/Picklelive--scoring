/** DTOs shared between server and client. */
import type { MatchState, MatchConfig, Side, EngineEvent } from "./scoring/types";
import type { StandingRow, Tiebreak } from "./tournament/standings";

export type MatchStatus = "SCHEDULED" | "LINEUP" | "LIVE" | "PAUSED" | "FINISHED" | "WALKOVER" | "RETIRED" | "NOT_REQUIRED";
export type TieStatus = "SCHEDULED" | "IN_PROGRESS" | "DECIDED" | "FINISHED";

/** What the big-screen TV display shows; set by the admin and pushed live to /t/:slug/tv. */
export interface DisplaySettings {
  mode: "ALL" | "TEAM" | "TIE" | "ROTATE";
  teamId?: string | null;
  tieId?: string | null;
  /** Seconds per page when rotating. */
  rotateSeconds?: number;
  showPhotos?: boolean;
}

export interface TournamentSettings {
  display?: DisplaySettings;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  tiebreakOrder: Tiebreak[];
  restGapMinutes: number;
  soundsEnabled: boolean;
  matchDurationMinutes: number;
}

export const DEFAULT_SETTINGS: TournamentSettings = {
  pointsWin: 2,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakOrder: ["TIE_POINTS", "HEAD_TO_HEAD", "MATCH_DIFF", "GAME_DIFF", "POINT_DIFF", "POINTS_FOR"],
  restGapMinutes: 15,
  soundsEnabled: true,
  matchDurationMinutes: 30,
};

export interface PublicTournament {
  id: string;
  slug: string;
  name: string;
  venue: string | null;
  startDate: string | null;
  endDate: string | null;
  logoUrl: string | null;
  timezone: string;
  ageCutoffDate: string;
  courtNames: string[];
  settings: TournamentSettings;
}

export interface PublicCategory {
  id: string;
  name: string;
  code: string;
  format: "SINGLES" | "DOUBLES";
  genderRule: "ANY" | "MALE" | "FEMALE" | "MIXED";
  ageLabel: string;
  color: string;
  icon: string;
  sortOrder: number;
}

export interface PublicTeam {
  id: string;
  name: string;
  code: string;
  color: string;
  logoUrl: string | null;
  captain: string | null;
}

export interface PublicPlayer {
  id: string;
  name: string;
  teamId: string | null;
  gender: "MALE" | "FEMALE";
  ageGroup: string;
  photoUrl: string | null;
  jersey: string | null;
  handedness: string | null;
  skill: number | null;
}

export interface PublicGroup {
  id: string;
  name: string;
  order: number;
  teamIds: string[];
}

export interface PublicStage {
  id: string;
  name: string;
  type: "ROUND_ROBIN" | "KNOCKOUT";
  order: number;
  templateId: string | null;
  settings: { qualifiersPerGroup?: number; seedTeamIds?: string[]; thirdPlace?: boolean; doubleRoundRobin?: boolean };
  groups: PublicGroup[];
}

export interface LiveInfo {
  phase: MatchState["phase"];
  call: string;
  servingTeam: Side;
  serverId: string | null;
  serverNumber: 1 | 2 | null;
  gamePoint: Side[];
  matchPoint: Side[];
  switchEndsAlert: boolean;
  score: { a: number; b: number };
  activeTimeout: MatchState["activeTimeout"];
}

export interface MatchSummary {
  id: string;
  tieId: string;
  categoryId: string;
  slotOrder: number;
  weight: number;
  isDecider: boolean;
  status: MatchStatus;
  court: string | null;
  scheduledAt: string | null;
  durationMin: number;
  winner: Side | null;
  gamesA: number;
  gamesB: number;
  games: { a: number; b: number; winner: Side | null }[];
  live: LiveInfo | null;
  /** Player IDs, or null when not yet known / hidden by a blind lineup. */
  lineupA: string[] | null;
  lineupB: string[] | null;
  lineupALocked: boolean;
  lineupBLocked: boolean;
  bestOf: number;
  pointsToWin: number;
  scoringType: "SIDE_OUT" | "RALLY";
  seq: number;
  updatedAt: string;
}

export interface TieSummary {
  id: string;
  stageId: string;
  groupId: string | null;
  round: number;
  roundLabel: string | null;
  bracketPos: number | null;
  teamAId: string | null;
  teamBId: string | null;
  templateId: string | null;
  status: TieStatus;
  scoreA: number;
  scoreB: number;
  winner: "A" | "B" | "DRAW" | null;
  court: string | null;
  scheduledAt: string | null;
  nextTieId: string | null;
  nextSide: string | null;
  matches: MatchSummary[];
}

export interface GroupStandings {
  stageId: string;
  groupId: string;
  qualifiers: number;
  rows: StandingRow[];
}

export interface CategoryBoard {
  categoryId: string;
  teams: { teamId: string; won: number; lost: number; pointsFor: number; pointsAgainst: number }[];
  pairs: { playerIds: string[]; teamId: string; won: number; lost: number; pointsFor: number; pointsAgainst: number }[];
}

export interface TournamentBundle {
  tournament: PublicTournament;
  categories: PublicCategory[];
  teams: PublicTeam[];
  players: PublicPlayer[];
  stages: PublicStage[];
  ties: TieSummary[];
  standings: GroupStandings[];
  categoryBoards: CategoryBoard[];
  generatedAt: string;
}

export interface MatchDetail {
  match: MatchSummary;
  state: MatchState;
  config: MatchConfig;
}

export interface RefLineupPlayer {
  id: string;
  name: string;
  gender: "MALE" | "FEMALE";
  ageGroup: string;
  jersey: string | null;
  eligible: boolean;
  reasons: string[];
}

export interface SlotLineupInfo {
  matchId: string;
  categoryId: string;
  slotOrder: number;
  status: MatchStatus;
  teams: {
    side: Side;
    teamId: string;
    playerIds: string[];
    locked: boolean;
    submitted: boolean;
    overrideReason: string | null;
    overridePlayerIds: string[];
    roster: RefLineupPlayer[];
  }[];
}

export interface TieLineups {
  tieId: string;
  blind: boolean;
  usageLimit: number;
  allowPairRepeat: boolean;
  slots: SlotLineupInfo[];
}

export interface RefBundle {
  tournament: PublicTournament;
  tie: TieSummary;
  match: MatchSummary;
  state: MatchState;
  config: MatchConfig;
  category: PublicCategory;
  teamA: PublicTeam | null;
  teamB: PublicTeam | null;
  players: PublicPlayer[];
  lineups: SlotLineupInfo;
  /** Full event log (including UNDOs) so the client can replay optimistically with the same engine. */
  events: EngineEvent[];
  refSubmitted: boolean;
  /** Set when either team is still playing another unfinished tie (the match can't start yet). */
  busy?: string | null;
}

/** Socket.IO server -> client event names. */
export const SOCKET = {
  matchUpdate: "match:update",
  matchState: "match:state",
  tieUpdate: "tie:update",
  invalidate: "tournament:invalidate",
  refRevoked: "ref:revoked",
} as const;
