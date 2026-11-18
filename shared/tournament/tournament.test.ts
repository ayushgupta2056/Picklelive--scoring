import { describe, expect, it } from "vitest";
import { roundRobin, bracket, seedOrder, crossSeed } from "./fixtures";
import { computeStandings, type StandingTieInput } from "./standings";
import { findConflicts } from "./conflicts";

describe("fixtures", () => {
  it("round robin gives every pair exactly once", () => {
    const rounds = roundRobin(["a", "b", "c", "d", "e"]);
    expect(rounds).toHaveLength(5);
    const pairs = rounds.flat().map((p) => [...p].sort().join());
    expect(new Set(pairs).size).toBe(10);
    expect(pairs).toHaveLength(10);
  });
  it("no team plays twice in a round", () => {
    for (const rd of roundRobin([1, 2, 3, 4, 5, 6])) {
      const ids = rd.flat();
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("seeded bracket order", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
  it("bracket with byes for top seeds", () => {
    const b = bracket(6);
    expect(b.size).toBe(8);
    const r1 = b.matches.filter((m) => m.round === 1);
    expect(r1[0]).toMatchObject({ seedA: 1, seedB: null });
    expect(b.matches.filter((m) => m.round === 3)[0].label).toBe("Final");
  });
  it("cross seeding pairs group winners against runners-up", () => {
    expect(crossSeed([["A1", "A2"], ["B1", "B2"]], 2)).toEqual(["A1", "B1", "B2", "A2"]);
  });
});

describe("standings", () => {
  const tie = (id: string, a: string, b: string, winner: "A" | "B" | "DRAW", ga: number[][]): StandingTieInput => ({
    id, teamAId: a, teamBId: b, finished: true, winner,
    matches: ga.map(([x, y]) => ({ winner: x > y ? "A" : "B", games: [{ a: x, b: y }] })),
  });
  it("ranks by tie points and uses head-to-head", () => {
    const rows = computeStandings(["x", "y", "z"], [
      tie("1", "x", "y", "A", [[11, 5], [11, 5]]),
      tie("2", "y", "z", "A", [[11, 0], [11, 0]]),
      tie("3", "z", "x", "A", [[11, 9], [11, 9]]),
    ]);
    expect(rows.map((r) => r.tiePoints)).toEqual([2, 2, 2]);
    // all h2h circular -> falls through to match diff (equal) -> game diff (equal) -> point diff
    expect(rows[0].teamId).toBe("y");
  });
  it("head-to-head breaks a two-way tie", () => {
    const rows = computeStandings(["x", "y"], [tie("1", "x", "y", "B", [[1, 11]]), tie("2", "x", "y", "A", [[11, 0]]), tie("3", "y", "x", "A", [[11, 10]])]);
    expect(rows[0].teamId).toBe("y");
  });
  it("draws award draw points", () => {
    const rows = computeStandings(["x", "y"], [tie("1", "x", "y", "DRAW", [[11, 5], [5, 11]])]);
    expect(rows.every((r) => r.tiePoints === 1 && r.drawn === 1)).toBe(true);
  });
});

describe("conflicts", () => {
  const t = (h: number, m = 0) => new Date(Date.UTC(2026, 0, 1, h, m));
  it("detects court overlap, double booking and rest gap", () => {
    const c = findConflicts([
      { id: "1", label: "M1", court: "C1", start: t(9), durationMin: 30, playerIds: ["p1"] },
      { id: "2", label: "M2", court: "C1", start: t(9, 15), durationMin: 30, playerIds: [] },
      { id: "3", label: "M3", court: "C2", start: t(9, 10), durationMin: 30, playerIds: ["p1"] },
      { id: "4", label: "M4", court: "C3", start: t(10, 0), durationMin: 30, playerIds: ["p1"] },
    ], 30);
    const kinds = c.map((x) => x.kind).sort();
    expect(kinds).toContain("COURT_OVERLAP");
    expect(kinds).toContain("PLAYER_DOUBLE_BOOKED");
    expect(kinds).toContain("REST_GAP");
  });
});
