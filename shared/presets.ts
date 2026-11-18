import type { MatchConfig } from "./scoring/types";

export interface CategoryPreset {
  name: string;
  code: string;
  format: "SINGLES" | "DOUBLES";
  genderRule: "ANY" | "MALE" | "FEMALE" | "MIXED";
  ageRuleType: "NONE" | "UNDER" | "OVER" | "RANGE";
  ageMin?: number | null;
  ageMax?: number | null;
  color: string;
  icon: string;
  scoringConfig?: Partial<MatchConfig>;
}

export const CATEGORY_PRESETS: CategoryPreset[] = [
  { name: "Men's Doubles", code: "MD", format: "DOUBLES", genderRule: "MALE", ageRuleType: "NONE", color: "#3B82F6", icon: "users" },
  { name: "Women's Doubles", code: "WD", format: "DOUBLES", genderRule: "FEMALE", ageRuleType: "NONE", color: "#EC4899", icon: "users" },
  { name: "Mixed Doubles", code: "XD", format: "DOUBLES", genderRule: "MIXED", ageRuleType: "NONE", color: "#A855F7", icon: "shuffle" },
  { name: "U18 Boys Doubles", code: "U18BD", format: "DOUBLES", genderRule: "MALE", ageRuleType: "UNDER", ageMax: 18, color: "#06B6D4", icon: "zap" },
  { name: "U18 Girls Doubles", code: "U18GD", format: "DOUBLES", genderRule: "FEMALE", ageRuleType: "UNDER", ageMax: 18, color: "#F472B6", icon: "zap" },
  { name: "U18 Mixed Doubles", code: "U18XD", format: "DOUBLES", genderRule: "MIXED", ageRuleType: "UNDER", ageMax: 18, color: "#22D3EE", icon: "zap" },
  { name: "U14 Doubles", code: "U14", format: "DOUBLES", genderRule: "ANY", ageRuleType: "UNDER", ageMax: 14, color: "#34D399", icon: "sparkles", scoringConfig: { bestOf: 1, pointsToWin: 15, timeoutsPerGame: 2, switchEndsAt: 8 } },
  { name: "35+ Doubles", code: "D35", format: "DOUBLES", genderRule: "ANY", ageRuleType: "OVER", ageMin: 35, color: "#F59E0B", icon: "award" },
  { name: "50+ Doubles", code: "D50", format: "DOUBLES", genderRule: "ANY", ageRuleType: "OVER", ageMin: 50, color: "#F97316", icon: "award" },
  { name: "Open Singles", code: "OS", format: "SINGLES", genderRule: "ANY", ageRuleType: "NONE", color: "#C6FF00", icon: "user" },
];
