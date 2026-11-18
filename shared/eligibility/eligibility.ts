export type Gender = "MALE" | "FEMALE";
export type GenderRule = "ANY" | "MALE" | "FEMALE" | "MIXED";
export type AgeRuleType = "NONE" | "UNDER" | "OVER" | "RANGE";

export interface AgeRule {
  type: AgeRuleType;
  /** UNDER: age must be < max. OVER: age must be >= min. RANGE: min <= age <= max. */
  min?: number | null;
  max?: number | null;
}

export interface CategoryRules {
  format: "SINGLES" | "DOUBLES";
  genderRule: GenderRule;
  ageRule: AgeRule;
  skillMin?: number | null;
  skillMax?: number | null;
}

export interface EligPlayer {
  id: string;
  name?: string;
  gender: Gender;
  /** ISO date (YYYY-MM-DD). */
  dob: string | null;
  skill?: number | null;
  teamId: string;
}

export interface UsageContext {
  /** Max number of category slots one player may play in a single tie. */
  usageLimit: number;
  /** Whether the same pair may play together in more than one slot of the tie. */
  allowPairRepeat: boolean;
  /** Lineups already entered in OTHER slots of the same tie, for the same team. */
  otherLineups: string[][];
}

export interface EligibilityContext {
  cutoffDate: string;
  teamId: string;
  rosterIds: string[];
  usage?: UsageContext;
  /** Player IDs force-allowed by an admin override. */
  overrides?: string[];
}

export interface PlayerEligibility {
  playerId: string;
  eligible: boolean;
  overridden: boolean;
  reasons: string[];
}

export function parseISODate(d: string): { y: number; m: number; d: number } {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  if (!y || !m || !day) throw new Error(`Invalid date ${d}`);
  return { y, m, d: day };
}

/** Full years of age on the given date. A birthday falling ON the date counts as already reached. */
export function ageOn(dob: string, on: string): number {
  const b = parseISODate(dob);
  const t = parseISODate(on);
  let age = t.y - b.y;
  if (t.m < b.m || (t.m === b.m && t.d < b.d)) age -= 1;
  return age;
}

export function describeAgeRule(r: AgeRule): string {
  switch (r.type) {
    case "UNDER":
      return `Under ${r.max}`;
    case "OVER":
      return `${r.min}+`;
    case "RANGE":
      return `${r.min}–${r.max}`;
    default:
      return "Open";
  }
}

/** Public-facing age group label (never reveals DOB). */
export function ageGroupLabel(dob: string | null, cutoff: string): string {
  if (!dob) return "Open";
  const age = ageOn(dob, cutoff);
  if (age < 14) return "U14";
  if (age < 18) return "U18";
  if (age >= 50) return "50+";
  if (age >= 35) return "35+";
  return "Open";
}

export function ageReason(player: EligPlayer, rule: AgeRule, cutoff: string): string | null {
  if (rule.type === "NONE") return null;
  if (!player.dob) return "Date of birth missing";
  const age = ageOn(player.dob, cutoff);
  if (rule.type === "UNDER" && rule.max != null && !(age < rule.max)) return `Over ${rule.max - 1} on cutoff date`;
  if (rule.type === "OVER" && rule.min != null && !(age >= rule.min)) return `Under ${rule.min} on cutoff date`;
  if (rule.type === "RANGE") {
    if (rule.min != null && age < rule.min) return `Under ${rule.min} on cutoff date`;
    if (rule.max != null && age > rule.max) return `Over ${rule.max} on cutoff date`;
  }
  return null;
}

function genderReason(p: EligPlayer, rule: GenderRule): string | null {
  if (rule === "MALE" && p.gender !== "MALE") return "Men only";
  if (rule === "FEMALE" && p.gender !== "FEMALE") return "Women only";
  return null;
}

function skillReason(p: EligPlayer, c: CategoryRules): string | null {
  if (c.skillMin == null && c.skillMax == null) return null;
  if (p.skill == null) return "Skill rating missing";
  if (c.skillMin != null && p.skill < c.skillMin) return `Rating below ${c.skillMin}`;
  if (c.skillMax != null && p.skill > c.skillMax) return `Rating above ${c.skillMax}`;
  return null;
}

/**
 * Eligibility of a single player for a slot. If `partnerIds` are given (the other players
 * already picked for this slot), pair-level rules (mixed, pair repeat) are also checked.
 */
export function checkPlayer(
  player: EligPlayer,
  category: CategoryRules,
  ctx: EligibilityContext,
  partners: EligPlayer[] = [],
): PlayerEligibility {
  const reasons: string[] = [];
  if (player.teamId !== ctx.teamId || !ctx.rosterIds.includes(player.id)) reasons.push("Not in roster");
  const g = genderReason(player, category.genderRule);
  if (g) reasons.push(g);
  const a = ageReason(player, category.ageRule, ctx.cutoffDate);
  if (a) reasons.push(a);
  const sk = skillReason(player, category);
  if (sk) reasons.push(sk);

  if (category.format === "DOUBLES" && category.genderRule === "MIXED") {
    const others = partners.filter((p) => p.id !== player.id);
    if (others.length > 0 && others.every((o) => o.gender === player.gender)) reasons.push("Mixed needs 1M + 1F");
  }

  if (ctx.usage) {
    const used = ctx.usage.otherLineups.filter((l) => l.includes(player.id)).length;
    if (used >= ctx.usage.usageLimit) reasons.push(`Already used in ${used} categories this tie`);
    if (!ctx.usage.allowPairRepeat) {
      for (const o of partners) {
        if (o.id === player.id) continue;
        if (ctx.usage.otherLineups.some((l) => l.includes(player.id) && l.includes(o.id))) {
          reasons.push("Pair already played together this tie");
          break;
        }
      }
    }
  }

  const overridden = reasons.length > 0 && (ctx.overrides ?? []).includes(player.id);
  return { playerId: player.id, eligible: reasons.length === 0 || overridden, overridden, reasons };
}

export interface LineupValidation {
  valid: boolean;
  errors: string[];
  players: PlayerEligibility[];
}

export function requiredPlayers(category: CategoryRules): number {
  return category.format === "DOUBLES" ? 2 : 1;
}

/** Validate a complete lineup for one team in one slot. */
export function validateLineup(lineup: EligPlayer[], category: CategoryRules, ctx: EligibilityContext): LineupValidation {
  const errors: string[] = [];
  const need = requiredPlayers(category);
  if (lineup.length !== need) errors.push(`${category.format === "DOUBLES" ? "Doubles" : "Singles"} needs ${need} player${need > 1 ? "s" : ""}`);
  if (new Set(lineup.map((p) => p.id)).size !== lineup.length) errors.push("A player is listed twice");
  const overrides = ctx.overrides ?? [];
  if (category.format === "DOUBLES" && category.genderRule === "MIXED" && lineup.length === 2) {
    const males = lineup.filter((p) => p.gender === "MALE").length;
    if (males !== 1 && !lineup.every((p) => overrides.includes(p.id))) errors.push("Mixed needs 1M + 1F");
  }
  const players = lineup.map((p) => checkPlayer(p, category, ctx, lineup));
  for (const p of players) {
    if (!p.eligible) errors.push(`${lineup.find((l) => l.id === p.playerId)?.name ?? p.playerId}: ${p.reasons.join(", ")}`);
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], players };
}
