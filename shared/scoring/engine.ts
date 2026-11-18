import {
  EngineError,
  type EngineEvent,
  type MatchConfig,
  type MatchState,
  type Side,
  type TeamPositions,
  type TeamStats,
} from "./types";

export * from "./types";

export const other = (s: Side): Side => (s === "A" ? "B" : "A");
const key = (s: Side): "a" | "b" => (s === "A" ? "a" : "b");

/** Sensible defaults for a config, following USA Pickleball conventions. */
export function defaultConfig(partial: Partial<MatchConfig> = {}): MatchConfig {
  const pointsToWin = partial.pointsToWin ?? 11;
  const cfg: MatchConfig = {
    scoringType: "SIDE_OUT",
    pointsToWin,
    winBy: 2,
    pointCap: null,
    bestOf: 3,
    format: "DOUBLES",
    timeoutsPerGame: pointsToWin >= 21 ? 3 : 2,
    timeoutSeconds: 60,
    switchEndsAt: pointsToWin >= 21 ? 11 : pointsToWin >= 15 ? 8 : 6,
    medicalTimeoutMinutes: 15,
    ...partial,
  };
  return cfg;
}

export function gamesNeeded(cfg: MatchConfig): number {
  return Math.ceil(cfg.bestOf / 2);
}

function emptyTeamStats(): TeamStats {
  return { ralliesWon: 0, pointsWon: 0, pointsOnServe: 0, pointsOnReceive: 0, sideOutsWon: 0, longestRun: 0 };
}

export function initialState(config: MatchConfig): MatchState {
  const blank: TeamPositions = { right: "", left: null };
  return {
    config,
    phase: "NOT_STARTED",
    games: [],
    gameIndex: 0,
    gamesWon: { A: 0, B: 0 },
    servingTeam: "A",
    serverNumber: null,
    serverId: null,
    serveCourt: "RIGHT",
    positions: { A: { ...blank }, B: { ...blank } },
    gameStartPositions: { A: { ...blank }, B: { ...blank } },
    firstServingTeamOfGame: "A",
    ends: { A: "NEAR", B: "FAR" },
    endsSwitchedThisGame: false,
    switchEndsAlert: false,
    timeoutsUsed: { A: 0, B: 0 },
    activeTimeout: null,
    medicalUsed: [],
    warnings: [],
    gamePoint: [],
    matchPoint: [],
    winner: null,
    resultType: null,
    call: "0-0",
    rallyInGame: 0,
    timeline: [],
    stats: { A: emptyTeamStats(), B: emptyTeamStats(), totalRallies: 0, leadChanges: 0, sideOuts: 0 },
    log: [],
    effectiveEvents: 0,
    lastAction: null,
  };
}

// ---------- helpers ----------

const isDoubles = (s: MatchState) => s.config.format === "DOUBLES";
const isSideOutDoubles = (s: MatchState) => isDoubles(s) && s.config.scoringType === "SIDE_OUT";

function score(s: MatchState, side: Side): number {
  const g = s.games[s.gameIndex];
  return g ? g[key(side)] : 0;
}

function isDecidingGame(s: MatchState): boolean {
  const need = gamesNeeded(s.config);
  return s.gamesWon.A === need - 1 && s.gamesWon.B === need - 1;
}

/** Would `side` win the current game if it reached the given score with the opponent on `opp`? */
function wouldWinGame(cfg: MatchConfig, mine: number, opp: number): boolean {
  if (cfg.pointCap != null && mine >= cfg.pointCap) return true;
  return mine >= cfg.pointsToWin && mine - opp >= cfg.winBy;
}

/** Place the server for the serving team based on format and scoring rules. */
function placeServer(s: MatchState) {
  const team = s.servingTeam;
  const sc = score(s, team);
  const pos = s.positions[team];
  if (!isDoubles(s)) {
    s.serverId = pos.right;
    s.serveCourt = sc % 2 === 0 ? "RIGHT" : "LEFT";
    return;
  }
  if (s.config.scoringType === "SIDE_OUT") {
    // Server is whoever is already designated; court is where they stand.
    if (s.serverId == null) s.serverId = pos.right;
    s.serveCourt = pos.right === s.serverId ? "RIGHT" : "LEFT";
    return;
  }
  // RALLY doubles: serve court follows the serving team's score parity; the player in that court serves.
  s.serveCourt = sc % 2 === 0 ? "RIGHT" : "LEFT";
  s.serverId = s.serveCourt === "RIGHT" ? pos.right : (pos.left ?? pos.right);
}

function swapPartners(s: MatchState, team: Side) {
  const p = s.positions[team];
  if (p.left == null) return;
  s.positions[team] = { right: p.left, left: p.right };
}

function updateCall(s: MatchState) {
  if (s.phase === "NOT_STARTED") {
    s.call = isSideOutDoubles(s) ? "0-0-2" : "0-0";
    return;
  }
  const serving = score(s, s.servingTeam);
  const receiving = score(s, other(s.servingTeam));
  if (s.phase === "FINISHED") {
    const g = s.games[s.gameIndex];
    s.call = `${g.a}-${g.b}`;
    return;
  }
  s.call = isSideOutDoubles(s) ? `${serving}-${receiving}-${s.serverNumber ?? 1}` : `${serving}-${receiving}`;
}

function updateFlags(s: MatchState) {
  s.gamePoint = [];
  s.matchPoint = [];
  if (s.phase !== "IN_PROGRESS" && s.phase !== "BETWEEN_GAMES") return;
  const need = gamesNeeded(s.config);
  const sides: Side[] = s.config.scoringType === "SIDE_OUT" ? [s.servingTeam] : ["A", "B"];
  for (const side of sides) {
    if (wouldWinGame(s.config, score(s, side) + 1, score(s, other(side)))) {
      s.gamePoint.push(side);
      if (s.gamesWon[side] === need - 1) s.matchPoint.push(side);
    }
  }
}

function switchEnds(s: MatchState) {
  s.ends = { A: s.ends.B, B: s.ends.A };
  s.switchEndsAlert = true;
}

function startGame(s: MatchState, firstServing: Side) {
  s.games.push({ a: 0, b: 0, winner: null });
  s.gameIndex = s.games.length - 1;
  s.phase = "IN_PROGRESS";
  s.servingTeam = firstServing;
  s.firstServingTeamOfGame = firstServing;
  s.timeoutsUsed = { A: 0, B: 0 };
  s.activeTimeout = null;
  s.endsSwitchedThisGame = false;
  s.rallyInGame = 0;
  s.positions = { A: { ...s.gameStartPositions.A }, B: { ...s.gameStartPositions.B } };
  s.serverId = null;
  // 0-0-2: the first serving team in side-out doubles gets only one server.
  s.serverNumber = isSideOutDoubles(s) ? 2 : null;
  placeServer(s);
}

function finishGame(s: MatchState, winner: Side) {
  const g = s.games[s.gameIndex];
  g.winner = winner;
  s.gamesWon[winner] += 1;
  s.activeTimeout = null;
  s.log.push({ type: "RALLY", text: `Game ${s.gameIndex + 1} to ${winner} (${g.a}-${g.b})` });
  if (s.gamesWon[winner] >= gamesNeeded(s.config)) {
    s.phase = "FINISHED";
    s.winner = winner;
    s.resultType = s.resultType ?? "NORMAL";
    return;
  }
  // Ends switch after every game; next game is served first by the team that received first this game.
  switchEnds(s);
  const nextFirst = other(s.firstServingTeamOfGame);
  startGame(s, nextFirst);
  s.phase = "BETWEEN_GAMES";
}

function sideOut(s: MatchState) {
  s.servingTeam = other(s.servingTeam);
  s.stats.sideOuts += 1;
  if (isSideOutDoubles(s)) {
    s.serverNumber = 1;
    s.serverId = s.positions[s.servingTeam].right;
  } else {
    s.serverId = null;
  }
  placeServer(s);
}

function addPoint(s: MatchState, side: Side, onServe: boolean) {
  const g = s.games[s.gameIndex];
  const lastLevelBroken = [...s.timeline].reverse().find((t) => t.game === s.gameIndex + 1 && t.a !== t.b);
  const lastLeader: Side | null = lastLevelBroken ? (lastLevelBroken.a > lastLevelBroken.b ? "A" : "B") : null;
  g[key(side)] += 1;
  const leaderAfter: Side | null = g.a === g.b ? null : g.a > g.b ? "A" : "B";
  if (leaderAfter && lastLeader && leaderAfter !== lastLeader) s.stats.leadChanges += 1;
  const st = s.stats[side];
  st.pointsWon += 1;
  if (onServe) st.pointsOnServe += 1;
  else st.pointsOnReceive += 1;
}

function computeRuns(s: MatchState) {
  let run = 0;
  let last: Side | null = null;
  const best = { A: 0, B: 0 };
  for (const t of s.timeline) {
    if (!t.pointTo) continue;
    if (t.pointTo === last) run += 1;
    else {
      run = 1;
      last = t.pointTo;
    }
    if (run > best[t.pointTo]) best[t.pointTo] = run;
  }
  s.stats.A.longestRun = best.A;
  s.stats.B.longestRun = best.B;
}

function checkMidGameSwitch(s: MatchState) {
  if (s.config.switchEndsAt == null || s.endsSwitchedThisGame || !isDecidingGame(s)) return;
  const lead = Math.max(score(s, "A"), score(s, "B"));
  if (lead >= s.config.switchEndsAt) {
    s.endsSwitchedThisGame = true;
    switchEnds(s);
    s.log.push({ type: "RALLY", text: `Switch ends at ${s.games[s.gameIndex].a}-${s.games[s.gameIndex].b}` });
  }
}

// ---------- event application ----------

function requireLive(s: MatchState) {
  if (s.phase === "NOT_STARTED") throw new EngineError("Match has not started");
  if (s.phase === "FINISHED") throw new EngineError("Match is finished");
}

function applyRally(s: MatchState, winner: Side) {
  requireLive(s);
  if (s.phase === "BETWEEN_GAMES") s.phase = "IN_PROGRESS";
  s.activeTimeout = null;
  s.rallyInGame += 1;
  s.stats.totalRallies += 1;
  s.stats[winner].ralliesWon += 1;
  const serving = s.servingTeam;
  const serverNumber = s.serverNumber;
  let outcome: "POINT" | "SIDE_OUT" | "SECOND_SERVER";
  let pointTo: Side | null = null;

  if (winner === serving) {
    addPoint(s, winner, true);
    pointTo = winner;
    outcome = "POINT";
    if (isDoubles(s)) {
      swapPartners(s, serving);
      // same server keeps serving from the other side
      placeServerKeepingServer(s);
    } else {
      placeServer(s);
    }
  } else {
    s.stats[winner].sideOutsWon += 1;
    if (s.config.scoringType === "RALLY") {
      addPoint(s, winner, false);
      pointTo = winner;
      outcome = "SIDE_OUT";
      sideOut(s);
    } else if (isDoubles(s) && s.serverNumber === 1) {
      outcome = "SECOND_SERVER";
      s.serverNumber = 2;
      const p = s.positions[serving];
      s.serverId = s.serverId === p.right ? p.left : p.right;
      placeServer(s);
    } else {
      outcome = "SIDE_OUT";
      sideOut(s);
    }
  }

  const g = s.games[s.gameIndex];
  s.timeline.push({
    game: s.gameIndex + 1,
    rally: s.rallyInGame,
    winner,
    servingTeam: serving,
    serverNumber: isSideOutDoubles(s) ? serverNumber : null,
    outcome,
    pointTo,
    a: g.a,
    b: g.b,
  });

  if (pointTo && wouldWinGame(s.config, g[key(pointTo)], g[key(other(pointTo))])) {
    finishGame(s, pointTo);
  } else if (pointTo) {
    checkMidGameSwitch(s);
  }
}

function placeServerKeepingServer(s: MatchState) {
  const pos = s.positions[s.servingTeam];
  if (s.config.scoringType === "SIDE_OUT") {
    s.serveCourt = pos.right === s.serverId ? "RIGHT" : "LEFT";
  } else {
    placeServer(s);
  }
}

export function applyEvent(prev: MatchState, ev: EngineEvent): MatchState {
  const s: MatchState = structuredClone(prev);
  s.switchEndsAlert = false;
  switch (ev.type) {
    case "SETUP": {
      if (s.phase !== "NOT_STARTED") throw new EngineError("Match already set up");
      const p = ev.payload;
      for (const side of ["A", "B"] as Side[]) {
        const pos = p.positions[side];
        if (!pos?.right) throw new EngineError(`Team ${side} needs a right-court player`);
        if (isDoubles(s) && !pos.left) throw new EngineError(`Team ${side} needs a left-court player`);
        if (!isDoubles(s) && pos.left) throw new EngineError("Singles has one player per side");
      }
      s.gameStartPositions = {
        A: { right: p.positions.A.right, left: p.positions.A.left ?? null },
        B: { right: p.positions.B.right, left: p.positions.B.left ?? null },
      };
      const aEnd = p.teamAEnd ?? "NEAR";
      s.ends = { A: aEnd, B: aEnd === "NEAR" ? "FAR" : "NEAR" };
      startGame(s, p.firstServingTeam);
      s.log.push({ type: "SETUP", at: ev.at, text: `Match started; ${p.firstServingTeam} serves first` });
      break;
    }
    case "RALLY":
      applyRally(s, ev.payload.winner);
      break;
    case "SET_POSITIONS": {
      requireLive(s);
      if (s.rallyInGame > 0) throw new EngineError("Positions can only be set before the first rally of a game");
      const { team, positions } = ev.payload;
      const cur = s.positions[team];
      const ids = [cur.right, cur.left].filter(Boolean).sort().join();
      const next = [positions.right, positions.left].filter(Boolean).sort().join();
      if (ids !== next) throw new EngineError("Positions must use the same players");
      s.positions[team] = { right: positions.right, left: positions.left ?? null };
      s.gameStartPositions[team] = { ...s.positions[team] };
      s.serverId = null;
      placeServer(s);
      break;
    }
    case "TIMEOUT": {
      requireLive(s);
      const t = ev.payload.team;
      if (s.timeoutsUsed[t] >= s.config.timeoutsPerGame) throw new EngineError(`Team ${t} has no timeouts left`);
      s.timeoutsUsed[t] += 1;
      s.activeTimeout = { team: t, startedAt: ev.at ?? null, seconds: s.config.timeoutSeconds };
      s.log.push({ type: "TIMEOUT", at: ev.at, text: `Timeout ${t} (${s.timeoutsUsed[t]}/${s.config.timeoutsPerGame})` });
      break;
    }
    case "TIMEOUT_END":
      requireLive(s);
      s.activeTimeout = null;
      break;
    case "MEDICAL_TIMEOUT": {
      requireLive(s);
      const { team, playerId } = ev.payload;
      if (s.medicalUsed.includes(playerId)) throw new EngineError("Medical timeout already used by this player");
      const pos = s.positions[team];
      if (pos.right !== playerId && pos.left !== playerId) throw new EngineError("Player is not on that team");
      s.medicalUsed.push(playerId);
      s.activeTimeout = {
        team,
        startedAt: ev.at ?? null,
        seconds: s.config.medicalTimeoutMinutes * 60,
        medical: true,
        playerId,
      };
      s.log.push({ type: "MEDICAL_TIMEOUT", at: ev.at, text: `Medical timeout ${team}` });
      break;
    }
    case "WARNING": {
      requireLive(s);
      const w = ev.payload;
      s.warnings.push({ team: w.team, playerId: w.playerId ?? null, kind: w.kind, note: w.note, game: s.gameIndex + 1, at: ev.at });
      s.log.push({ type: "WARNING", at: ev.at, text: `${w.kind.replace("_", " ").toLowerCase()} on ${w.team}` });
      break;
    }
    case "END_GAME": {
      requireLive(s);
      s.log.push({ type: "END_GAME", at: ev.at, text: `Game ended manually` });
      finishGame(s, ev.payload.winner);
      break;
    }
    case "RETIRE":
    case "FORFEIT": {
      if (s.phase === "FINISHED") throw new EngineError("Match is finished");
      s.phase = "FINISHED";
      s.winner = other(ev.payload.team);
      s.resultType = ev.type === "RETIRE" ? "RETIRED" : "FORFEIT";
      s.activeTimeout = null;
      s.log.push({ type: ev.type, at: ev.at, text: `Team ${ev.payload.team} ${ev.type === "RETIRE" ? "retired" : "forfeited"}` });
      break;
    }
    case "ADMIN_SET_RESULT": {
      const { games, winner } = ev.payload;
      if (!games.length) throw new EngineError("At least one game score is required");
      s.games = games.map((g) => ({ a: g.a, b: g.b, winner: g.a === g.b ? null : g.a > g.b ? "A" : "B" }));
      s.gameIndex = s.games.length - 1;
      s.gamesWon = {
        A: s.games.filter((g) => g.winner === "A").length,
        B: s.games.filter((g) => g.winner === "B").length,
      };
      s.phase = "FINISHED";
      s.winner = winner;
      s.resultType = "ADMIN";
      s.activeTimeout = null;
      s.log.push({ type: "ADMIN_SET_RESULT", at: ev.at, text: `Result set by admin` });
      break;
    }
    case "UNDO":
      throw new EngineError("UNDO must be resolved by replay()");
    default:
      throw new EngineError(`Unknown event ${(ev as { type: string }).type}`);
  }
  s.effectiveEvents += 1;
  s.lastAction = ev.type;
  computeRuns(s);
  updateFlags(s);
  updateCall(s);
  return s;
}

/** Resolve UNDO events: each UNDO cancels the most recent still-effective event. */
export function effectiveEvents(events: EngineEvent[]): EngineEvent[] {
  const stack: EngineEvent[] = [];
  for (const ev of events) {
    // Undoing the SETUP itself simply resets the match to "not started".
    if (ev.type === "UNDO") stack.pop();
    else stack.push(ev);
  }
  return stack;
}

export function canUndo(events: EngineEvent[]): boolean {
  return effectiveEvents(events).length > 0;
}

/** state = replay(events). Pure and deterministic. */
export function replay(config: MatchConfig, events: EngineEvent[]): MatchState {
  let s = initialState(config);
  updateCall(s);
  for (const ev of effectiveEvents(events)) s = applyEvent(s, ev);
  return s;
}

/** Validate that an event can be appended (throws EngineError otherwise) and return the next state. */
export function tryAppend(config: MatchConfig, events: EngineEvent[], ev: EngineEvent): MatchState {
  if (ev.type === "UNDO") {
    if (!canUndo(events)) throw new EngineError("Nothing to undo");
    return replay(config, [...events, ev]);
  }
  return applyEvent(replay(config, events), ev);
}

/** Describe what a rally won by `winner` would do — used for confirmation prompts. */
export function previewRally(state: MatchState, winner: Side): { endsGame: boolean; endsMatch: boolean } {
  if (state.phase !== "IN_PROGRESS" && state.phase !== "BETWEEN_GAMES") return { endsGame: false, endsMatch: false };
  const endsGame = state.gamePoint.includes(winner) && (state.config.scoringType === "RALLY" || state.servingTeam === winner);
  const endsMatch = endsGame && state.matchPoint.includes(winner);
  return { endsGame, endsMatch };
}
