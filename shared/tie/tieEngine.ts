export type TieSide = "A" | "B";

export type SlotMatchStatus =
  | "SCHEDULED"
  | "LINEUP"
  | "LIVE"
  | "PAUSED"
  | "FINISHED"
  | "WALKOVER"
  | "RETIRED"
  | "NOT_REQUIRED";

export interface TieSlotInput {
  order: number;
  weight: number;
  isDecider: boolean;
  status: SlotMatchStatus;
  winner: TieSide | null;
}

export interface TieRules {
  /** What happens when the regular slots end level. */
  levelPolicy: "DECIDER" | "DRAW";
  /** Stop once the tie is mathematically decided. */
  stopEarly: boolean;
  /** When stopping early: mark remaining matches NOT_REQUIRED, or keep them as dead rubbers. */
  earlyStopMode: "NOT_REQUIRED" | "DEAD_RUBBER";
}

export type TieStatus = "SCHEDULED" | "IN_PROGRESS" | "DECIDED" | "FINISHED";

export interface TieResult {
  scoreA: number;
  scoreB: number;
  matchesWonA: number;
  matchesWonB: number;
  status: TieStatus;
  winner: TieSide | "DRAW" | null;
  /** Slot orders that no longer need to be played. */
  notRequired: number[];
  /** Slot orders that will be played but cannot change the outcome. */
  deadRubbers: number[];
  deciderRequired: boolean;
  remainingWeight: number;
}

export const DEFAULT_TIE_RULES: TieRules = { levelPolicy: "DECIDER", stopEarly: true, earlyStopMode: "NOT_REQUIRED" };

const DONE: SlotMatchStatus[] = ["FINISHED", "WALKOVER", "RETIRED"];
const isDone = (s: TieSlotInput) => DONE.includes(s.status) && s.winner != null;
const isStarted = (s: TieSlotInput) => s.status === "LIVE" || s.status === "PAUSED" || isDone(s);

export function computeTie(slots: TieSlotInput[], rules: TieRules = DEFAULT_TIE_RULES): TieResult {
  const sorted = [...slots].sort((a, b) => a.order - b.order);
  const regular = sorted.filter((s) => !s.isDecider);
  const deciders = sorted.filter((s) => s.isDecider);

  let scoreA = 0;
  let scoreB = 0;
  let matchesWonA = 0;
  let matchesWonB = 0;
  for (const s of sorted) {
    if (!isDone(s)) continue;
    if (s.winner === "A") {
      scoreA += s.weight;
      matchesWonA += 1;
    } else {
      scoreB += s.weight;
      matchesWonB += 1;
    }
  }

  const regA = regular.filter((s) => isDone(s) && s.winner === "A").reduce((n, s) => n + s.weight, 0);
  const regB = regular.filter((s) => isDone(s) && s.winner === "B").reduce((n, s) => n + s.weight, 0);
  const remainingRegular = regular.filter((s) => !isDone(s) && s.status !== "NOT_REQUIRED");
  const remainingWeight = remainingRegular.reduce((n, s) => n + s.weight, 0);

  const notRequired: number[] = sorted.filter((s) => s.status === "NOT_REQUIRED" && !isDone(s)).map((s) => s.order);
  const deadRubbers: number[] = [];
  let winner: TieSide | "DRAW" | null = null;
  let deciderRequired = false;

  const clinchedA = regA > regB + remainingWeight;
  const clinchedB = regB > regA + remainingWeight;

  if (clinchedA || clinchedB) {
    winner = clinchedA ? "A" : "B";
    // Deciders are never needed once a team has clinched.
    for (const d of deciders) if (!isDone(d) && !notRequired.includes(d.order)) notRequired.push(d.order);
    for (const s of remainingRegular) {
      if (rules.stopEarly && rules.earlyStopMode === "NOT_REQUIRED") {
        if (!isStarted(s) && !notRequired.includes(s.order)) notRequired.push(s.order);
        else if (isStarted(s)) deadRubbers.push(s.order);
      } else deadRubbers.push(s.order);
    }
  } else if (remainingWeight === 0) {
    // All regular slots complete and the score is level.
    const usableDeciders = deciders.filter((d) => d.status !== "NOT_REQUIRED" || isDone(d));
    if (rules.levelPolicy === "DECIDER" && usableDeciders.length > 0) {
      const decided = usableDeciders.find(isDone);
      if (decided) winner = decided.winner;
      else deciderRequired = true;
    } else {
      winner = "DRAW";
      for (const d of deciders) if (!isDone(d) && !notRequired.includes(d.order)) notRequired.push(d.order);
    }
  }

  const outstanding = sorted.filter(
    (s) => !isDone(s) && !notRequired.includes(s.order) && (!s.isDecider || deciderRequired),
  );
  let status: TieStatus;
  if (!sorted.some(isStarted)) status = "SCHEDULED";
  else if (winner && outstanding.length === 0) status = "FINISHED";
  else if (winner) status = "DECIDED";
  else status = "IN_PROGRESS";

  return {
    scoreA,
    scoreB,
    matchesWonA,
    matchesWonB,
    status,
    winner,
    notRequired: notRequired.sort((a, b) => a - b),
    deadRubbers: deadRubbers.sort((a, b) => a - b),
    deciderRequired,
    remainingWeight,
  };
}
