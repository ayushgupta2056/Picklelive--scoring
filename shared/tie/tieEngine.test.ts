import { describe, expect, it } from "vitest";
import { computeTie, type TieSlotInput, type TieRules } from "./tieEngine";

const slot = (order: number, status: TieSlotInput["status"] = "SCHEDULED", winner: "A" | "B" | null = null, extra: Partial<TieSlotInput> = {}): TieSlotInput => ({
  order, weight: 1, isDecider: false, status, winner, ...extra,
});
const five = (results: ("A" | "B" | null)[], deciderResult: "A" | "B" | null = null): TieSlotInput[] => [
  ...results.map((w, i) => slot(i + 1, w ? "FINISHED" : "SCHEDULED", w)),
  slot(5, deciderResult ? "FINISHED" : "SCHEDULED", deciderResult, { isDecider: true }),
];
const STOP: TieRules = { levelPolicy: "DECIDER", stopEarly: true, earlyStopMode: "NOT_REQUIRED" };

describe("tie engine", () => {
  it("is SCHEDULED before any match starts", () => {
    const t = computeTie(five([null, null, null, null]), STOP);
    expect(t.status).toBe("SCHEDULED");
    expect(t.scoreA).toBe(0);
  });

  it("is IN_PROGRESS with a live match", () => {
    const slots = five([null, null, null, null]);
    slots[0].status = "LIVE";
    expect(computeTie(slots, STOP).status).toBe("IN_PROGRESS");
  });

  it("is decided early and marks remaining matches not required", () => {
    const t = computeTie(five(["A", "A", "A", null]), STOP);
    expect(t.winner).toBe("A");
    expect(t.status).toBe("FINISHED");
    expect(t.notRequired).toEqual([4, 5]);
    expect(t.scoreA).toBe(3);
  });

  it("keeps dead rubbers when configured", () => {
    const t = computeTie(five(["A", "A", "A", null]), { ...STOP, earlyStopMode: "DEAD_RUBBER" });
    expect(t.winner).toBe("A");
    expect(t.status).toBe("DECIDED");
    expect(t.deadRubbers).toEqual([4]);
    expect(t.notRequired).toEqual([5]);
  });

  it("without early stop, all regular matches are still played", () => {
    const t = computeTie(five(["B", "B", "B", null]), { ...STOP, stopEarly: false });
    expect(t.winner).toBe("B");
    expect(t.status).toBe("DECIDED");
    const done = computeTie(five(["B", "B", "B", "A"]), { ...STOP, stopEarly: false });
    expect(done.status).toBe("FINISHED");
    expect(done.scoreB).toBe(3);
    expect(done.scoreA).toBe(1);
  });

  it("level tie requires the decider", () => {
    const t = computeTie(five(["A", "B", "A", "B"]), STOP);
    expect(t.deciderRequired).toBe(true);
    expect(t.winner).toBeNull();
    expect(t.status).toBe("IN_PROGRESS");
  });

  it("decider winner wins the tie", () => {
    const t = computeTie(five(["A", "B", "A", "B"], "B"), STOP);
    expect(t.winner).toBe("B");
    expect(t.status).toBe("FINISHED");
    expect(t.scoreB).toBe(3);
  });

  it("level tie is a draw when draws are allowed", () => {
    const t = computeTie(five(["A", "B", "A", "B"]), { ...STOP, levelPolicy: "DRAW" });
    expect(t.winner).toBe("DRAW");
    expect(t.status).toBe("FINISHED");
    expect(t.notRequired).toEqual([5]);
  });

  it("respects weighted slots", () => {
    const slots = [slot(1, "FINISHED", "A", { weight: 2 }), slot(2, "FINISHED", "B"), slot(3)];
    const t = computeTie(slots, STOP);
    expect(t.scoreA).toBe(2);
    expect(t.remainingWeight).toBe(1);
    expect(t.winner).toBeNull();
    const t2 = computeTie([slot(1, "FINISHED", "A", { weight: 3 }), slot(2), slot(3)], STOP);
    expect(t2.winner).toBe("A");
  });

  it("counts walkovers and retirements", () => {
    const t = computeTie([slot(1, "WALKOVER", "B"), slot(2, "RETIRED", "B"), slot(3)], STOP);
    expect(t.scoreB).toBe(2);
    expect(t.winner).toBe("B");
  });

  it("a live match at clinch becomes a dead rubber, not cancelled", () => {
    const slots = five(["A", "A", "A", null]);
    slots[3].status = "LIVE";
    const t = computeTie(slots, STOP);
    expect(t.deadRubbers).toEqual([4]);
    expect(t.status).toBe("DECIDED");
  });
});
