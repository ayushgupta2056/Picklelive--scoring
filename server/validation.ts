import { z } from "zod";

const side = z.enum(["A", "B"]);
const positions = z.object({ right: z.string().min(1), left: z.string().min(1).nullable().optional() });

export const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("SETUP"),
    payload: z.object({
      firstServingTeam: side,
      positions: z.object({ A: positions, B: positions }),
      teamAEnd: z.enum(["NEAR", "FAR"]).optional(),
      coinTossWinner: side.optional(),
      coinTossChoice: z.enum(["SERVE", "RECEIVE", "END"]).optional(),
    }),
  }),
  z.object({ type: z.literal("RALLY"), payload: z.object({ winner: side }) }),
  z.object({ type: z.literal("SET_POSITIONS"), payload: z.object({ team: side, positions }) }),
  z.object({ type: z.literal("TIMEOUT"), payload: z.object({ team: side }) }),
  z.object({ type: z.literal("TIMEOUT_END"), payload: z.object({}).optional() }),
  z.object({ type: z.literal("MEDICAL_TIMEOUT"), payload: z.object({ team: side, playerId: z.string().min(1) }) }),
  z.object({
    type: z.literal("WARNING"),
    payload: z.object({ team: side, playerId: z.string().nullable().optional(), kind: z.enum(["WARNING", "TECHNICAL_FOUL", "FAULT"]), note: z.string().max(200).optional() }),
  }),
  z.object({ type: z.literal("END_GAME"), payload: z.object({ winner: side }) }),
  z.object({ type: z.literal("RETIRE"), payload: z.object({ team: side, reason: z.string().max(200).optional() }) }),
  z.object({ type: z.literal("FORFEIT"), payload: z.object({ team: side, reason: z.string().max(200).optional() }) }),
  z.object({
    type: z.literal("ADMIN_SET_RESULT"),
    payload: z.object({ games: z.array(z.object({ a: z.number().int().min(0).max(99), b: z.number().int().min(0).max(99) })).min(1).max(5), winner: side, reason: z.string().max(200).optional() }),
  }),
  z.object({ type: z.literal("UNDO"), payload: z.object({}).optional() }),
]);

export const incomingEventSchema = z.object({
  seq: z.number().int().min(1),
  idempotencyKey: z.string().min(8).max(80),
  event: eventSchema,
});

export const lineupSchema = z.object({
  teamId: z.string().min(1),
  playerIds: z.array(z.string().min(1)).min(1).max(2),
  overridePlayerIds: z.array(z.string()).max(2).optional(),
  overrideReason: z.string().trim().max(300).nullable().optional(),
});

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #RRGGBB color");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const matchConfigPartial = z
  .object({
    scoringType: z.enum(["SIDE_OUT", "RALLY"]),
    pointsToWin: z.union([z.literal(11), z.literal(15), z.literal(21)]),
    winBy: z.number().int().min(1).max(2),
    pointCap: z.number().int().min(1).max(50).nullable(),
    bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]),
    timeoutsPerGame: z.number().int().min(0).max(5),
    timeoutSeconds: z.number().int().min(10).max(300),
    switchEndsAt: z.number().int().min(1).max(30).nullable(),
    medicalTimeoutMinutes: z.number().int().min(1).max(30),
  })
  .partial();

export const tournamentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,60}$/, "Lowercase letters, numbers and dashes"),
  venue: z.string().trim().max(200).nullable().optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  timezone: z.string().min(1).max(60).default("Asia/Kolkata"),
  ageCutoffDate: isoDate,
  courtNames: z.array(z.string().trim().min(1).max(40)).min(1).max(40).optional(),
  logoMediaId: z.string().nullable().optional(),
  defaultTemplateId: z.string().nullable().optional(),
  published: z.boolean().optional(),
  settings: z
    .object({
      pointsWin: z.number().int().min(0).max(10),
      pointsDraw: z.number().int().min(0).max(10),
      pointsLoss: z.number().int().min(0).max(10),
      tiebreakOrder: z.array(z.enum(["TIE_POINTS", "HEAD_TO_HEAD", "MATCH_DIFF", "GAME_DIFF", "POINT_DIFF", "POINTS_FOR"])).min(1),
      restGapMinutes: z.number().int().min(0).max(240),
      soundsEnabled: z.boolean(),
      matchDurationMinutes: z.number().int().min(5).max(240),
    })
    .partial()
    .optional(),
});

export const categorySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,8}$/, "1–8 letters/digits"),
    format: z.enum(["SINGLES", "DOUBLES"]),
    genderRule: z.enum(["ANY", "MALE", "FEMALE", "MIXED"]),
    ageRuleType: z.enum(["NONE", "UNDER", "OVER", "RANGE"]),
    ageMin: z.number().int().min(0).max(120).nullable().optional(),
    ageMax: z.number().int().min(0).max(120).nullable().optional(),
    skillMin: z.number().min(0).max(8).nullable().optional(),
    skillMax: z.number().min(0).max(8).nullable().optional(),
    scoringConfig: matchConfigPartial.optional(),
    color: hex.optional(),
    icon: z.string().max(30).optional(),
    sortOrder: z.number().int().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.genderRule === "MIXED" && c.format !== "DOUBLES") ctx.addIssue({ code: "custom", path: ["genderRule"], message: "Mixed requires doubles" });
    if (c.ageRuleType === "UNDER" && c.ageMax == null) ctx.addIssue({ code: "custom", path: ["ageMax"], message: "Set the 'under' age" });
    if (c.ageRuleType === "OVER" && c.ageMin == null) ctx.addIssue({ code: "custom", path: ["ageMin"], message: "Set the minimum age" });
    if (c.ageRuleType === "RANGE" && (c.ageMin == null || c.ageMax == null || c.ageMin > c.ageMax))
      ctx.addIssue({ code: "custom", path: ["ageMin"], message: "Set a valid age range" });
  });

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  levelPolicy: z.enum(["DECIDER", "DRAW"]),
  stopEarly: z.boolean(),
  earlyStopMode: z.enum(["NOT_REQUIRED", "DEAD_RUBBER"]),
  usageLimit: z.number().int().min(1).max(10),
  allowPairRepeat: z.boolean(),
  rosterMin: z.number().int().min(1).max(50),
  rosterMax: z.number().int().min(1).max(50),
  blindLineup: z.boolean(),
  slots: z
    .array(z.object({ categoryId: z.string().min(1), weight: z.number().int().min(1).max(10).default(1), isDecider: z.boolean().default(false) }))
    .min(1)
    .max(15),
});

export const teamSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,4}$/, "2–4 letters (3 recommended)"),
  color: hex,
  logoMediaId: z.string().nullable().optional(),
  captain: z.string().trim().max(80).nullable().optional(),
  managerName: z.string().trim().max(80).nullable().optional(),
  managerContact: z.string().trim().max(120).nullable().optional(),
});

export const playerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  teamId: z.string().nullable().optional(),
  gender: z.enum(["MALE", "FEMALE"]),
  dob: isoDate.nullable().optional(),
  skill: z.number().min(0).max(8).nullable().optional(),
  jersey: z.string().trim().max(10).nullable().optional(),
  handedness: z.enum(["R", "L"]).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  photoMediaId: z.string().nullable().optional(),
});

export const stageSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["ROUND_ROBIN", "KNOCKOUT"]),
  order: z.number().int().optional(),
  templateId: z.string().nullable().optional(),
  settings: z
    .object({ qualifiersPerGroup: z.number().int().min(1).max(16), doubleRoundRobin: z.boolean(), thirdPlace: z.boolean(), seedTeamIds: z.array(z.string()) })
    .partial()
    .optional(),
});

export const groupsSchema = z.array(z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(40), teamIds: z.array(z.string()) })).max(26);

export const matchPatchSchema = z.object({
  court: z.string().max(40).nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  durationMin: z.number().int().min(5).max(240).optional(),
  configOverride: matchConfigPartial.nullable().optional(),
});

export const tiePatchSchema = z.object({
  teamAId: z.string().nullable().optional(),
  teamBId: z.string().nullable().optional(),
  court: z.string().max(40).nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  templateId: z.string().nullable().optional(),
});

export const tieSlotsSchema = z.array(z.object({ matchId: z.string().optional(), categoryId: z.string().min(1), weight: z.number().int().min(1).max(10), isDecider: z.boolean() })).min(1).max(15);
