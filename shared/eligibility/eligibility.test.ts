import { describe, expect, it } from "vitest";
import { ageOn, checkPlayer, validateLineup, ageGroupLabel, type CategoryRules, type EligPlayer, type EligibilityContext } from "./eligibility";

const CUTOFF = "2026-01-01";
const p = (id: string, gender: "MALE" | "FEMALE", dob: string | null = "1995-05-05", extra: Partial<EligPlayer> = {}): EligPlayer => ({ id, name: id, gender, dob, teamId: "T1", ...extra });
const ctx = (extra: Partial<EligibilityContext> = {}): EligibilityContext => ({ cutoffDate: CUTOFF, teamId: "T1", rosterIds: ["m1", "m2", "f1", "f2", "kid", "kid2", "old"], ...extra });
const U18: CategoryRules = { format: "DOUBLES", genderRule: "ANY", ageRule: { type: "UNDER", max: 18 } };
const XD: CategoryRules = { format: "DOUBLES", genderRule: "MIXED", ageRule: { type: "NONE" } };
const MD: CategoryRules = { format: "DOUBLES", genderRule: "MALE", ageRule: { type: "NONE" } };
const O35: CategoryRules = { format: "DOUBLES", genderRule: "ANY", ageRule: { type: "OVER", min: 35 } };

describe("eligibility", () => {
  it("computes age with birthday on the cutoff date counted as reached", () => {
    expect(ageOn("2008-01-01", CUTOFF)).toBe(18);
    expect(ageOn("2008-01-02", CUTOFF)).toBe(17);
    expect(ageOn("2007-12-31", CUTOFF)).toBe(18);
  });

  it("player turning 18 exactly on the cutoff date is NOT under 18", () => {
    const r = checkPlayer(p("kid", "MALE", "2008-01-01"), U18, ctx());
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain("Over 17 on cutoff date");
  });

  it("player turning 18 the day after the cutoff is under 18", () => {
    expect(checkPlayer(p("kid", "MALE", "2008-01-02"), U18, ctx()).eligible).toBe(true);
  });

  it("over-35 includes players exactly 35 on the cutoff", () => {
    expect(checkPlayer(p("old", "FEMALE", "1991-01-01"), O35, ctx()).eligible).toBe(true);
    expect(checkPlayer(p("old", "FEMALE", "1991-01-02"), O35, ctx()).reasons).toContain("Under 35 on cutoff date");
  });

  it("range rule checks both ends", () => {
    const R: CategoryRules = { format: "SINGLES", genderRule: "ANY", ageRule: { type: "RANGE", min: 14, max: 17 } };
    expect(checkPlayer(p("kid", "MALE", "2012-06-01"), R, ctx()).eligible).toBe(false);
    expect(checkPlayer(p("kid", "MALE", "2010-06-01"), R, ctx()).eligible).toBe(true);
  });

  it("missing DOB fails an age rule", () => {
    expect(checkPlayer(p("kid", "MALE", null), U18, ctx()).reasons).toContain("Date of birth missing");
  });

  it("gender rules for men's doubles", () => {
    expect(checkPlayer(p("f1", "FEMALE"), MD, ctx()).reasons).toContain("Men only");
    expect(checkPlayer(p("m1", "MALE"), MD, ctx()).eligible).toBe(true);
  });

  it("mixed doubles needs exactly 1M + 1F", () => {
    expect(validateLineup([p("m1", "MALE"), p("f1", "FEMALE")], XD, ctx()).valid).toBe(true);
    const bad = validateLineup([p("m1", "MALE"), p("m2", "MALE")], XD, ctx());
    expect(bad.valid).toBe(false);
    expect(bad.errors).toContain("Mixed needs 1M + 1F");
  });

  it("mixed doubles greys out same-gender partner in the picker", () => {
    const r = checkPlayer(p("m2", "MALE"), XD, ctx(), [p("m1", "MALE")]);
    expect(r.reasons).toContain("Mixed needs 1M + 1F");
  });

  it("rejects players not on the team's roster", () => {
    const r = checkPlayer(p("x", "MALE", "1990-01-01", { teamId: "T2" }), MD, ctx());
    expect(r.reasons).toContain("Not in roster");
  });

  it("enforces the per-tie usage limit", () => {
    const usage = { usageLimit: 2, allowPairRepeat: true, otherLineups: [["m1", "m2"], ["m1", "f1"]] };
    const r = checkPlayer(p("m1", "MALE"), MD, ctx({ usage }));
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain("Already used in 2 categories this tie");
    expect(checkPlayer(p("m2", "MALE"), MD, ctx({ usage })).eligible).toBe(true);
  });

  it("blocks repeating the same pair when not allowed", () => {
    const usage = { usageLimit: 3, allowPairRepeat: false, otherLineups: [["m1", "m2"]] };
    const v = validateLineup([p("m1", "MALE"), p("m2", "MALE")], MD, ctx({ usage }));
    expect(v.valid).toBe(false);
    expect(v.errors.join()).toMatch(/Pair already played together/);
  });

  it("admin override makes an ineligible player eligible", () => {
    const r = checkPlayer(p("kid", "MALE", "2000-01-01"), U18, ctx({ overrides: ["kid"] }));
    expect(r.eligible).toBe(true);
    expect(r.overridden).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("singles lineup needs exactly one player", () => {
    const OS: CategoryRules = { format: "SINGLES", genderRule: "ANY", ageRule: { type: "NONE" } };
    expect(validateLineup([p("m1", "MALE"), p("m2", "MALE")], OS, ctx()).valid).toBe(false);
    expect(validateLineup([p("m1", "MALE")], OS, ctx()).valid).toBe(true);
  });

  it("skill range", () => {
    const SK: CategoryRules = { format: "SINGLES", genderRule: "ANY", ageRule: { type: "NONE" }, skillMin: 3, skillMax: 4 };
    expect(checkPlayer(p("m1", "MALE", null, { skill: 4.5 }), SK, ctx()).reasons).toContain("Rating above 4");
    expect(checkPlayer(p("m1", "MALE", null, { skill: 3.5 }), SK, ctx()).eligible).toBe(true);
  });

  it("public age group label never needs the DOB to be shown", () => {
    expect(ageGroupLabel("2012-03-01", CUTOFF)).toBe("U14");
    expect(ageGroupLabel("2009-03-01", CUTOFF)).toBe("U18");
    expect(ageGroupLabel("1985-03-01", CUTOFF)).toBe("35+");
    expect(ageGroupLabel(null, CUTOFF)).toBe("Open");
  });
});
