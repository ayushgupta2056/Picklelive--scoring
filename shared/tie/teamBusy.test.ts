import { describe, expect, it } from "vitest";
import { busyConflicts, busyMessage, isTieActive, type TieLite } from "./teamBusy";
import { planSchedule } from "../tournament/schedulePlan";

const tie = (id: string, a: string, b: string, status: TieLite["status"], ms: string[] = ["SCHEDULED"]): TieLite => ({ id, teamAId: a, teamBId: b, status, matches: ms.map((s) => ({ status: s })) });

describe("one team, one tie at a time", () => {
  it("a tie is active from its first started match until it is finished", () => {
    expect(isTieActive(tie("1", "A", "B", "SCHEDULED"))).toBe(false);
    expect(isTieActive(tie("1", "A", "B", "SCHEDULED", ["LIVE", "SCHEDULED"]))).toBe(true);
    expect(isTieActive(tie("1", "A", "B", "IN_PROGRESS", ["FINISHED", "SCHEDULED"]))).toBe(true);
    expect(isTieActive(tie("1", "A", "B", "DECIDED", ["FINISHED", "LIVE"]))).toBe(true);
    expect(isTieActive(tie("1", "A", "B", "FINISHED", ["FINISHED", "NOT_REQUIRED"]))).toBe(false);
  });

  it("blocks a team from starting a second tie while its current tie is unfinished", () => {
    const ties = [tie("AB", "A", "B", "IN_PROGRESS", ["FINISHED", "LIVE", "SCHEDULED"]), tie("AC", "A", "C", "SCHEDULED"), tie("CD", "C", "D", "SCHEDULED")];
    const c = busyConflicts(ties, "AC");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ teamId: "A", tie: { id: "AB" } });
    expect(busyConflicts(ties, "CD")).toHaveLength(0);
    // matches of the active tie itself are never blocked (parallel courts)
    expect(busyConflicts(ties, "AB")).toHaveLength(0);
    expect(busyMessage(c, (id) => `Team ${id}`)).toMatch(/Team A is still playing vs Team B/);
  });

  it("frees the team once the tie is finished", () => {
    const ties = [tie("AB", "A", "B", "FINISHED", ["FINISHED"]), tie("AC", "A", "C", "SCHEDULED")];
    expect(busyConflicts(ties, "AC")).toHaveLength(0);
  });

  it("reports both teams when both are busy elsewhere", () => {
    const ties = [tie("AX", "A", "X", "IN_PROGRESS", ["LIVE"]), tie("BY", "B", "Y", "IN_PROGRESS", ["LIVE"]), tie("AB", "A", "B", "SCHEDULED")];
    expect(busyConflicts(ties, "AB").map((c) => c.teamId)).toEqual(["A", "B"]);
  });
});

describe("auto-schedule planner", () => {
  const T0 = Date.UTC(2026, 0, 1, 9);
  const min = (ms: number) => (ms - T0) / 60000;
  it("runs a tie's matches in parallel and never overlaps a team's ties", () => {
    const plan = planSchedule(
      [
        { id: "AB", teamIds: ["A", "B"], matchIds: ["ab1", "ab2", "ab3", "ab4", "ab5"] },
        { id: "CD", teamIds: ["C", "D"], matchIds: ["cd1", "cd2", "cd3", "cd4", "cd5"] },
        { id: "AC", teamIds: ["A", "C"], matchIds: ["ac1", "ac2"] },
      ],
      ["C1", "C2", "C3", "C4"],
      T0,
      30,
    );
    const at = (id: string) => min(plan.find((p) => p.matchId === id)!.start);
    expect([at("ab1"), at("ab2"), at("ab3"), at("ab4")]).toEqual([0, 0, 0, 0]);
    expect(at("ab5")).toBe(30);
    // CD uses free courts in parallel with AB's last match (different teams)
    expect(at("cd1")).toBe(30);
    // AC must wait until both AB (ends 60) and CD (ends 90) are over
    const abEnd = 60;
    const cdEnd = Math.max(...["cd1", "cd2", "cd3", "cd4", "cd5"].map(at)) + 30;
    expect(Math.min(at("ac1"), at("ac2"))).toBeGreaterThanOrEqual(Math.max(abEnd, cdEnd));
  });

  it("knockout: sibling semi-finals run in parallel, the final waits for both", () => {
    const plan = planSchedule(
      [
        { id: "SF1", teamIds: ["A", "B"], matchIds: ["s1"], waitFor: ["feed-SF1"], marks: ["feed-F"] },
        { id: "SF2", teamIds: ["C", "D"], matchIds: ["s2"], waitFor: ["feed-SF2"], marks: ["feed-F"] },
        { id: "F", teamIds: [], matchIds: ["f"], waitFor: ["feed-F"] },
      ],
      ["C1", "C2"],
      T0,
      30,
    );
    const at = (id: string) => min(plan.find((p) => p.matchId === id)!.start);
    expect(at("s1")).toBe(0);
    expect(at("s2")).toBe(0);
    expect(at("f")).toBe(30);
  });
});
