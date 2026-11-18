import { describe, expect, it } from "vitest";
import { defaultConfig, replay, tryAppend, previewRally, effectiveEvents, type EngineEvent, type MatchConfig, type Side } from "./engine";

const doublesSetup = (first: Side = "A"): EngineEvent => ({
  type: "SETUP",
  payload: {
    firstServingTeam: first,
    positions: { A: { right: "a1", left: "a2" }, B: { right: "b1", left: "b2" } },
    teamAEnd: "NEAR",
  },
});
const singlesSetup = (first: Side = "A"): EngineEvent => ({
  type: "SETUP",
  payload: { firstServingTeam: first, positions: { A: { right: "a1", left: null }, B: { right: "b1", left: null } } },
});
const r = (w: Side): EngineEvent => ({ type: "RALLY", payload: { winner: w } });
const many = (w: Side, n: number) => Array.from({ length: n }, () => r(w));
const UNDO: EngineEvent = { type: "UNDO" };

const SO = defaultConfig({ bestOf: 3 });
const SO1 = defaultConfig({ bestOf: 1 });
const RALLY = defaultConfig({ scoringType: "RALLY", bestOf: 1, pointsToWin: 15 });
const SINGLES = defaultConfig({ format: "SINGLES", bestOf: 1 });

function run(cfg: MatchConfig, evs: EngineEvent[]) {
  return replay(cfg, evs);
}

/** Serving team wins a point in side-out doubles: A serves (#2), wins until a side out. */
describe("side-out doubles", () => {
  it("starts at 0-0-2 with the right-court player serving", () => {
    const s = run(SO, [doublesSetup()]);
    expect(s.call).toBe("0-0-2");
    expect(s.serverNumber).toBe(2);
    expect(s.serverId).toBe("a1");
    expect(s.serveCourt).toBe("RIGHT");
    expect(s.phase).toBe("IN_PROGRESS");
  });

  it("first serving team gets only one server: one lost rally is a side out", () => {
    const s = run(SO, [doublesSetup(), r("B")]);
    expect(s.servingTeam).toBe("B");
    expect(s.serverNumber).toBe(1);
    expect(s.serverId).toBe("b1");
    expect(s.call).toBe("0-0-1");
  });

  it("server wins a rally: +1 point, partners swap, same server from the other side", () => {
    const s = run(SO, [doublesSetup(), r("A")]);
    expect(s.games[0]).toMatchObject({ a: 1, b: 0 });
    expect(s.positions.A).toEqual({ right: "a2", left: "a1" });
    expect(s.serverId).toBe("a1");
    expect(s.serveCourt).toBe("LEFT");
    expect(s.call).toBe("1-0-2");
  });

  it("receiving team never switches sides on its own", () => {
    const s = run(SO, [doublesSetup(), r("A"), r("A"), r("A")]);
    expect(s.positions.B).toEqual({ right: "b1", left: "b2" });
  });

  it("server #1 losing passes to partner as server #2 without a swap", () => {
    const s = run(SO, [doublesSetup(), r("B"), r("A")]);
    expect(s.servingTeam).toBe("B");
    expect(s.serverNumber).toBe(2);
    expect(s.serverId).toBe("b2");
    expect(s.positions.B).toEqual({ right: "b1", left: "b2" });
    expect(s.serveCourt).toBe("LEFT");
    expect(s.call).toBe("0-0-2");
  });

  it("full side-out cycle returns serve to the first team as server #1 from the right", () => {
    // A#2 loses -> B#1 loses -> B#2 loses -> A#1
    const s = run(SO, [doublesSetup(), r("B"), r("A"), r("A")]);
    expect(s.servingTeam).toBe("A");
    expect(s.serverNumber).toBe(1);
    expect(s.serverId).toBe(s.positions.A.right);
    expect(s.stats.sideOuts).toBe(2);
  });

  it("only the serving team scores", () => {
    const s = run(SO, [doublesSetup(), r("B"), r("A"), r("A"), r("B")]);
    expect(s.games[0]).toMatchObject({ a: 0, b: 0 });
  });

  it("starting right-court player is on the right when the score is even, left when odd", () => {
    // Team A starting right is a1. Score points and side outs in a long sequence.
    const seq = [doublesSetup(), r("A"), r("A"), r("A"), r("B"), r("B"), r("A"), r("B"), r("B"), r("A"), r("A"), r("B"), r("B")];
    let evs: EngineEvent[] = [];
    for (const e of seq) {
      evs = [...evs, e];
      const s = run(SO, evs);
      const aScore = s.games[0].a;
      const bScore = s.games[0].b;
      expect(s.positions.A.right === "a1").toBe(aScore % 2 === 0);
      expect(s.positions.B.right === "b1").toBe(bScore % 2 === 0);
    }
  });

  it("call reflects serving score first", () => {
    const s = run(SO, [doublesSetup(), r("A"), r("A"), r("B"), r("B")]);
    // side out to B, then B scores once on serve: "1-2-1"
    expect(s.call).toBe("1-2-1");
  });

  it("game requires win by 2 at 10-10", () => {
    // Build 10-10 by alternating: A scores 10 from start, side out, B scores 10.
    const evs = [doublesSetup(), ...many("A", 10), r("B"), ...many("B", 10)];
    let s = run(SO1, evs);
    expect(s.games[0]).toMatchObject({ a: 10, b: 10 });
    s = run(SO1, [...evs, r("B")]);
    expect(s.games[0]).toMatchObject({ a: 10, b: 11 });
    expect(s.phase).toBe("IN_PROGRESS");
    s = run(SO1, [...evs, r("B"), r("B")]);
    expect(s.phase).toBe("FINISHED");
    expect(s.winner).toBe("B");
  });

  it("point cap ends the game without a 2-point lead", () => {
    const cfg = defaultConfig({ bestOf: 1, pointCap: 12 });
    // 10-0 A, side out, B to 11 (11-10 is not a win), B#1 and B#2 lose -> A serving at 10-11
    const base = [doublesSetup(), ...many("A", 10), r("B"), ...many("B", 11), r("A"), r("A")];
    let t = run(cfg, base);
    expect(t.servingTeam).toBe("A");
    t = run(cfg, [...base, r("A")]);
    expect(t.games[0]).toMatchObject({ a: 11, b: 11 });
    t = run(cfg, [...base, r("A"), r("A")]);
    expect(t.games[0]).toMatchObject({ a: 12, b: 11 });
    expect(t.phase).toBe("FINISHED");
    expect(t.winner).toBe("A");
  });

  it("flags GAME POINT and MATCH POINT for the serving team", () => {
    const s = run(SO1, [doublesSetup(), ...many("A", 10)]);
    expect(s.gamePoint).toEqual(["A"]);
    expect(s.matchPoint).toEqual(["A"]);
    const s3 = run(SO, [doublesSetup(), ...many("A", 10)]);
    expect(s3.gamePoint).toEqual(["A"]);
    expect(s3.matchPoint).toEqual([]);
  });

  it("previewRally detects game- and match-ending rallies", () => {
    const s = run(SO1, [doublesSetup(), ...many("A", 10)]);
    expect(previewRally(s, "A")).toEqual({ endsGame: true, endsMatch: true });
    expect(previewRally(s, "B")).toEqual({ endsGame: false, endsMatch: false });
  });
});

describe("best of 3 and ends", () => {
  it("switches ends after every game and alternates the first server", () => {
    const s = run(SO, [doublesSetup("A"), ...many("A", 11)]);
    expect(s.gamesWon).toEqual({ A: 1, B: 0 });
    expect(s.gameIndex).toBe(1);
    expect(s.ends).toEqual({ A: "FAR", B: "NEAR" });
    expect(s.switchEndsAlert).toBe(true);
    expect(s.servingTeam).toBe("B");
    expect(s.call).toBe("0-0-2");
    expect(s.phase).toBe("BETWEEN_GAMES");
  });

  it("switches ends at 6 in the deciding game", () => {
    const g1 = [doublesSetup("A"), ...many("A", 11)]; // A wins g1; B serves g2
    const g2 = [...many("B", 11)]; // B wins g2; A serves g3
    let s = run(SO, [...g1, ...g2]);
    expect(s.gamesWon).toEqual({ A: 1, B: 1 });
    expect(s.servingTeam).toBe("A");
    const endsAtStart = { ...s.ends };
    s = run(SO, [...g1, ...g2, ...many("A", 5)]);
    expect(s.ends).toEqual(endsAtStart);
    s = run(SO, [...g1, ...g2, ...many("A", 6)]);
    expect(s.ends).toEqual({ A: endsAtStart.B, B: endsAtStart.A });
    expect(s.switchEndsAlert).toBe(true);
    // only once
    s = run(SO, [...g1, ...g2, ...many("A", 8)]);
    expect(s.ends).toEqual({ A: endsAtStart.B, B: endsAtStart.A });
    expect(s.switchEndsAlert).toBe(false);
  });

  it("does not switch at 6 in a non-deciding game", () => {
    const s = run(SO, [doublesSetup("A"), ...many("A", 6)]);
    expect(s.ends).toEqual({ A: "NEAR", B: "FAR" });
  });

  it("match ends when a team wins 2 games", () => {
    const t = run(SO, [doublesSetup("A"), ...many("A", 11), r("A"), ...many("A", 11)]);
    expect(t.phase).toBe("FINISHED");
    expect(t.winner).toBe("A");
    expect(t.gamesWon).toEqual({ A: 2, B: 0 });
    expect(t.games.map((g) => [g.a, g.b])).toEqual([[11, 0], [11, 0]]);
  });

  it("rejects rallies after the match is finished", () => {
    const evs = [doublesSetup("A"), ...many("A", 11), r("A"), ...many("A", 11)];
    expect(() => tryAppend(SO, evs, r("A"))).toThrow(/finished/);
  });

  it("best of 5 needs 3 games", () => {
    const cfg = defaultConfig({ bestOf: 5 });
    const s = run(cfg, [doublesSetup("A"), ...many("A", 11), r("A"), ...many("A", 11)]);
    expect(s.phase).not.toBe("FINISHED");
    expect(s.gamesWon.A).toBe(2);
  });
});

describe("undo", () => {
  it("undoes a single point", () => {
    const s = run(SO, [doublesSetup(), r("A"), UNDO]);
    expect(s.games[0]).toMatchObject({ a: 0, b: 0 });
    expect(s.call).toBe("0-0-2");
    expect(s.positions.A).toEqual({ right: "a1", left: "a2" });
  });

  it("undoes across a side out (multi-level)", () => {
    const evs = [doublesSetup(), r("A"), r("A"), r("B")];
    let s = run(SO, evs);
    expect(s.servingTeam).toBe("B");
    s = run(SO, [...evs, UNDO]);
    expect(s.servingTeam).toBe("A");
    expect(s.serverNumber).toBe(2);
    expect(s.serverId).toBe("a1");
    expect(s.call).toBe("2-0-2");
    s = run(SO, [...evs, UNDO, UNDO]);
    expect(s.call).toBe("1-0-2");
  });

  it("undoes across a game boundary", () => {
    const evs = [doublesSetup("A"), ...many("A", 11)];
    const s = run(SO, [...evs, UNDO]);
    expect(s.gameIndex).toBe(0);
    expect(s.games).toHaveLength(1);
    expect(s.games[0]).toMatchObject({ a: 10, b: 0, winner: null });
    expect(s.gamesWon).toEqual({ A: 0, B: 0 });
    expect(s.ends).toEqual({ A: "NEAR", B: "FAR" });
  });

  it("undo then redo-by-new-event produces the right state", () => {
    const s = run(SO, [doublesSetup(), r("A"), UNDO, r("B")]);
    expect(s.servingTeam).toBe("B");
    expect(s.games[0]).toMatchObject({ a: 0, b: 0 });
  });

  it("undo of the setup resets the match", () => {
    const s = run(SO, [doublesSetup(), UNDO]);
    expect(s.phase).toBe("NOT_STARTED");
    expect(effectiveEvents([doublesSetup(), UNDO])).toHaveLength(0);
  });

  it("refuses undo with nothing to undo", () => {
    expect(() => tryAppend(SO, [], UNDO)).toThrow(/Nothing to undo/);
  });

  it("replay is deterministic", () => {
    const evs = [doublesSetup(), r("A"), r("B"), r("B"), r("A"), r("A"), UNDO, r("B")];
    expect(run(SO, evs)).toEqual(run(SO, evs));
  });
});

describe("singles", () => {
  it("serves from the right when the server's score is even, left when odd", () => {
    let s = run(SINGLES, [singlesSetup()]);
    expect(s.call).toBe("0-0");
    expect(s.serveCourt).toBe("RIGHT");
    s = run(SINGLES, [singlesSetup(), r("A")]);
    expect(s.serveCourt).toBe("LEFT");
    s = run(SINGLES, [singlesSetup(), r("A"), r("A")]);
    expect(s.serveCourt).toBe("RIGHT");
  });

  it("a lost rally is an immediate side out; server parity uses the new server's score", () => {
    const s = run(SINGLES, [singlesSetup(), r("A"), r("B")]);
    expect(s.servingTeam).toBe("B");
    expect(s.serverId).toBe("b1");
    expect(s.serveCourt).toBe("RIGHT");
    expect(s.call).toBe("0-1");
    const t = run(SINGLES, [singlesSetup(), r("B"), r("B")]);
    expect(t.servingTeam).toBe("B");
    expect(t.serveCourt).toBe("LEFT");
    expect(t.call).toBe("1-0");
  });

  it("rejects a doubles-style setup", () => {
    expect(() => run(SINGLES, [doublesSetup()])).toThrow(/Singles/);
  });
});

describe("rally scoring", () => {
  it("every rally scores, including for the receiving team", () => {
    const s = run(RALLY, [doublesSetup(), r("B")]);
    expect(s.games[0]).toMatchObject({ a: 0, b: 1 });
    expect(s.servingTeam).toBe("B");
    expect(s.call).toBe("1-0");
  });

  it("serve court follows the serving team's score parity", () => {
    const s = run(RALLY, [doublesSetup(), r("B")]);
    // B has 1 (odd) -> serve from left court; B did not swap on receive
    expect(s.positions.B).toEqual({ right: "b1", left: "b2" });
    expect(s.serveCourt).toBe("LEFT");
    expect(s.serverId).toBe("b2");
  });

  it("the receiving team can win on game point (no freeze)", () => {
    const evs = [doublesSetup("A"), ...many("B", 14)];
    let s = run(RALLY, evs);
    expect(s.games[0]).toMatchObject({ a: 0, b: 14 });
    // Make A serve at 1-14 by A winning one rally (A gets point + serve)
    s = run(RALLY, [...evs, r("A")]);
    expect(s.servingTeam).toBe("A");
    expect(s.gamePoint).toContain("B");
    s = run(RALLY, [...evs, r("A"), r("B")]);
    expect(s.phase).toBe("FINISHED");
    expect(s.winner).toBe("B");
    expect(s.games[0]).toMatchObject({ a: 1, b: 15 });
  });

  it("rally scoring flags game point for both sides at the cap", () => {
    const cfg = defaultConfig({ scoringType: "RALLY", bestOf: 1, pointsToWin: 11, pointCap: 13 });
    const evs = [doublesSetup(), ...Array.from({ length: 12 }, () => [r("A"), r("B")]).flat()];
    const s = run(cfg, evs);
    expect(s.games[0]).toMatchObject({ a: 12, b: 12 });
    expect(s.gamePoint.sort()).toEqual(["A", "B"]);
  });

  it("server keeps serving after winning, alternating courts", () => {
    const s = run(RALLY, [doublesSetup(), r("A"), r("A")]);
    expect(s.serverId).toBe("a1");
    expect(s.serveCourt).toBe("RIGHT");
  });
});

describe("timeouts, warnings, retirement", () => {
  it("limits timeouts per game and resets each game", () => {
    const evs: EngineEvent[] = [doublesSetup(), { type: "TIMEOUT", payload: { team: "A" } }, { type: "TIMEOUT", payload: { team: "A" } }];
    const s = run(SO, evs);
    expect(s.timeoutsUsed.A).toBe(2);
    expect(s.activeTimeout?.team).toBe("A");
    expect(() => tryAppend(SO, evs, { type: "TIMEOUT", payload: { team: "A" } })).toThrow(/no timeouts/);
    const g2 = run(SO, [...evs, ...many("A", 11)]);
    expect(g2.timeoutsUsed).toEqual({ A: 0, B: 0 });
  });

  it("a rally clears an active timeout", () => {
    const s = run(SO, [doublesSetup(), { type: "TIMEOUT", payload: { team: "B" } }, r("A")]);
    expect(s.activeTimeout).toBeNull();
  });

  it("medical timeout is once per player per match", () => {
    const mto: EngineEvent = { type: "MEDICAL_TIMEOUT", payload: { team: "A", playerId: "a1" } };
    const s = run(SO, [doublesSetup(), mto]);
    expect(s.activeTimeout?.seconds).toBe(15 * 60);
    expect(() => tryAppend(SO, [doublesSetup(), mto], mto)).toThrow(/already used/);
  });

  it("records warnings and technical fouls", () => {
    const s = run(SO, [doublesSetup(), { type: "WARNING", payload: { team: "B", kind: "TECHNICAL_FOUL", playerId: "b2" } }]);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0]).toMatchObject({ team: "B", kind: "TECHNICAL_FOUL", game: 1 });
  });

  it("retirement ends the match for the opponent", () => {
    const s = run(SO, [doublesSetup(), r("A"), { type: "RETIRE", payload: { team: "A" } }]);
    expect(s.phase).toBe("FINISHED");
    expect(s.winner).toBe("B");
    expect(s.resultType).toBe("RETIRED");
  });

  it("manual end game awards the game", () => {
    const s = run(SO, [doublesSetup(), r("A"), { type: "END_GAME", payload: { winner: "A" } }]);
    expect(s.gamesWon.A).toBe(1);
    expect(s.gameIndex).toBe(1);
  });

  it("admin can set the final result", () => {
    const s = run(SO, [doublesSetup(), { type: "ADMIN_SET_RESULT", payload: { games: [{ a: 11, b: 7 }, { a: 9, b: 11 }, { a: 11, b: 4 }], winner: "A" } }]);
    expect(s.phase).toBe("FINISHED");
    expect(s.gamesWon).toEqual({ A: 2, B: 1 });
  });

  it("cannot rally before setup", () => {
    expect(() => tryAppend(SO, [], r("A"))).toThrow(/not started/);
  });

  it("positions can be changed only before the first rally of a game", () => {
    const sp: EngineEvent = { type: "SET_POSITIONS", payload: { team: "A", positions: { right: "a2", left: "a1" } } };
    const s = run(SO, [doublesSetup(), sp]);
    expect(s.serverId).toBe("a2");
    expect(() => tryAppend(SO, [doublesSetup(), r("A")], sp)).toThrow(/before the first rally/);
  });
});

describe("stats", () => {
  it("tracks longest run, side outs and lead changes", () => {
    const s = run(SO1, [doublesSetup("A"), ...many("A", 3), r("B"), r("B"), ...many("B", 5)]);
    expect(s.stats.A.longestRun).toBe(3);
    expect(s.stats.B.longestRun).toBe(6);
    expect(s.stats.leadChanges).toBe(1);
    expect(s.stats.sideOuts).toBe(1);
    expect(s.stats.A.pointsOnServe).toBe(3);
    expect(s.timeline.filter((t) => t.pointTo).length).toBe(9);
  });
});
