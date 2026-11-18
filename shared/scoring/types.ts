export type Side = "A" | "B";
export type ScoringType = "SIDE_OUT" | "RALLY";
export type MatchFormat = "SINGLES" | "DOUBLES";
export type Court = "RIGHT" | "LEFT";
export type End = "NEAR" | "FAR";

export interface MatchConfig {
  scoringType: ScoringType;
  pointsToWin: number;
  winBy: number;
  /** Hard cap: first to reach this score wins regardless of margin. null = no cap. */
  pointCap: number | null;
  bestOf: 1 | 3 | 5;
  format: MatchFormat;
  timeoutsPerGame: number;
  timeoutSeconds: number;
  /** Switch ends in the deciding game when the leading team first reaches this score. null = never. */
  switchEndsAt: number | null;
  medicalTimeoutMinutes: number;
}

export interface TeamPositions {
  right: string;
  left: string | null;
}

export interface SetupPayload {
  /** Team that serves first in game 1. */
  firstServingTeam: Side;
  /** Player IDs: for doubles, who starts in the right and left courts. */
  positions: { A: TeamPositions; B: TeamPositions };
  /** Which end of the court team A starts on (relative to the referee's view). */
  teamAEnd?: End;
  coinTossWinner?: Side;
  coinTossChoice?: "SERVE" | "RECEIVE" | "END";
}

export type EngineEvent =
  | { type: "SETUP"; payload: SetupPayload; at?: string }
  | { type: "RALLY"; payload: { winner: Side }; at?: string }
  | { type: "SET_POSITIONS"; payload: { team: Side; positions: TeamPositions }; at?: string }
  | { type: "TIMEOUT"; payload: { team: Side }; at?: string }
  | { type: "TIMEOUT_END"; payload?: Record<string, never>; at?: string }
  | { type: "MEDICAL_TIMEOUT"; payload: { team: Side; playerId: string }; at?: string }
  | {
      type: "WARNING";
      payload: { team: Side; playerId?: string | null; kind: "WARNING" | "TECHNICAL_FOUL" | "FAULT"; note?: string };
      at?: string;
    }
  | { type: "END_GAME"; payload: { winner: Side }; at?: string }
  | { type: "RETIRE"; payload: { team: Side; reason?: string }; at?: string }
  | { type: "FORFEIT"; payload: { team: Side; reason?: string }; at?: string }
  | {
      type: "ADMIN_SET_RESULT";
      payload: { games: { a: number; b: number }[]; winner: Side; reason?: string };
      at?: string;
    }
  | { type: "UNDO"; payload?: Record<string, never>; at?: string };

export type EngineEventType = EngineEvent["type"];

export interface GameRecord {
  a: number;
  b: number;
  winner: Side | null;
}

export interface TimelineEntry {
  game: number; // 1-based
  rally: number; // 1-based within game
  winner: Side;
  servingTeam: Side;
  serverNumber: 1 | 2 | null;
  outcome: "POINT" | "SIDE_OUT" | "SECOND_SERVER";
  pointTo: Side | null;
  a: number;
  b: number;
}

export interface TeamStats {
  ralliesWon: number;
  pointsWon: number;
  pointsOnServe: number;
  pointsOnReceive: number;
  sideOutsWon: number;
  longestRun: number;
}

export interface MatchStats {
  A: TeamStats;
  B: TeamStats;
  totalRallies: number;
  leadChanges: number;
  sideOuts: number;
}

export interface LogEntry {
  type: EngineEventType;
  at?: string;
  text: string;
}

export type MatchPhase = "NOT_STARTED" | "IN_PROGRESS" | "BETWEEN_GAMES" | "FINISHED";
export type ResultType = "NORMAL" | "RETIRED" | "FORFEIT" | "ADMIN";

export interface MatchState {
  config: MatchConfig;
  phase: MatchPhase;
  /** All games, including the current one (last element) once the match has started. */
  games: GameRecord[];
  /** 0-based index of the current game. */
  gameIndex: number;
  gamesWon: { A: number; B: number };
  servingTeam: Side;
  serverNumber: 1 | 2 | null; // only side-out doubles uses 1/2
  serverId: string | null;
  serveCourt: Court;
  positions: { A: TeamPositions; B: TeamPositions };
  /** Positions at the start of the current game (so the next game can default to them). */
  gameStartPositions: { A: TeamPositions; B: TeamPositions };
  firstServingTeamOfGame: Side;
  ends: { A: End; B: End };
  endsSwitchedThisGame: boolean;
  /** True when the last applied action caused the teams to switch ends. */
  switchEndsAlert: boolean;
  timeoutsUsed: { A: number; B: number };
  activeTimeout: { team: Side; startedAt: string | null; seconds: number; medical?: boolean; playerId?: string } | null;
  medicalUsed: string[];
  warnings: { team: Side; playerId: string | null; kind: string; note?: string; game: number; at?: string }[];
  gamePoint: Side[];
  matchPoint: Side[];
  winner: Side | null;
  resultType: ResultType | null;
  call: string;
  rallyInGame: number;
  timeline: TimelineEntry[];
  stats: MatchStats;
  log: LogEntry[];
  /** Number of effective (non-undone) events. */
  effectiveEvents: number;
  lastAction: EngineEventType | null;
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}
