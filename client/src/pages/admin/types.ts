import type { MatchConfig } from "@shared/scoring/types";
import type { TournamentSettings } from "@shared/api";

export interface ACategory {
  id: string; tournamentId: string; name: string; code: string; format: "SINGLES" | "DOUBLES"; genderRule: "ANY" | "MALE" | "FEMALE" | "MIXED";
  ageRuleType: "NONE" | "UNDER" | "OVER" | "RANGE"; ageMin: number | null; ageMax: number | null; skillMin: number | null; skillMax: number | null;
  scoringConfig: Partial<MatchConfig>; color: string; icon: string; sortOrder: number;
}
export interface ASlot { id: string; order: number; categoryId: string; weight: number; isDecider: boolean }
export interface ATemplate {
  id: string; name: string; levelPolicy: "DECIDER" | "DRAW"; stopEarly: boolean; earlyStopMode: "NOT_REQUIRED" | "DEAD_RUBBER";
  usageLimit: number; allowPairRepeat: boolean; rosterMin: number; rosterMax: number; blindLineup: boolean; slots: ASlot[];
}
export interface ATeam { id: string; name: string; code: string; color: string; logoMediaId: string | null; captain: string | null; managerName: string | null; managerContact: string | null }
export interface APlayer {
  id: string; name: string; teamId: string | null; gender: "MALE" | "FEMALE"; dob: string | null; skill: number | null; jersey: string | null;
  handedness: "R" | "L" | null; phone: string | null; notes: string | null; photoMediaId: string | null;
}
export interface AStage {
  id: string; name: string; type: "ROUND_ROBIN" | "KNOCKOUT"; order: number; templateId: string | null;
  settings: { qualifiersPerGroup?: number; doubleRoundRobin?: boolean; thirdPlace?: boolean; seedTeamIds?: string[] };
  groups: { id: string; name: string; order: number; teams: { teamId: string; seed: number }[] }[];
}
export interface ATournament {
  id: string; slug: string; name: string; venue: string | null; startDate: string | null; endDate: string | null; timezone: string; ageCutoffDate: string;
  courtNames: string[]; logoMediaId: string | null; defaultTemplateId: string | null; published: boolean; settings: TournamentSettings;
  categories: ACategory[]; templates: ATemplate[]; teams: ATeam[]; players: APlayer[]; stages: AStage[];
}
