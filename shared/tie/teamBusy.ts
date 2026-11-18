/**
 * One team, one tie at a time: once Team A vs Team B has started, neither team may start a tie against
 * anyone else until every category match of A vs B is done (the tie is FINISHED).
 */
export interface TieLite {
  id: string;
  teamAId: string | null;
  teamBId: string | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "DECIDED" | "FINISHED";
  roundLabel?: string | null;
  scoreA?: number;
  scoreB?: number;
  matches: { status: string; seq?: number }[];
}

const STARTED = ["LIVE", "PAUSED", "FINISHED", "WALKOVER", "RETIRED"];

/** A tie is "active" once any of its matches has started and until the whole tie is finished. */
export function isTieActive(t: TieLite): boolean {
  if (t.status === "FINISHED") return false;
  return t.status === "IN_PROGRESS" || t.status === "DECIDED" || t.matches.some((m) => STARTED.includes(m.status) || (m.seq ?? 0) > 0);
}

export interface BusyConflict {
  teamId: string;
  tie: TieLite;
}

/** Other active ties that block starting a match in `tieId` (one entry per busy team). */
export function busyConflicts(ties: TieLite[], tieId: string): BusyConflict[] {
  const me = ties.find((t) => t.id === tieId);
  if (!me) return [];
  const out: BusyConflict[] = [];
  for (const teamId of [me.teamAId, me.teamBId]) {
    if (!teamId) continue;
    const other = ties.find((t) => t.id !== tieId && (t.teamAId === teamId || t.teamBId === teamId) && isTieActive(t));
    if (other) out.push({ teamId, tie: other });
  }
  return out;
}

export function busyMessage(c: BusyConflict[], name: (teamId: string | null) => string): string {
  return c
    .map(({ teamId, tie }) => {
      const opp = tie.teamAId === teamId ? tie.teamBId : tie.teamAId;
      const score = tie.scoreA != null ? ` (${tie.scoreA}–${tie.scoreB})` : "";
      return `${name(teamId)} is still playing ${tie.roundLabel ? `${tie.roundLabel} ` : ""}vs ${name(opp)}${score}`;
    })
    .join("; ")
    .concat(". Finish that tie before starting this one.");
}
