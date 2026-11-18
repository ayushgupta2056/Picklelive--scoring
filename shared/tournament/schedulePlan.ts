/**
 * Auto-schedule planner. Each tie's matches run in parallel on the earliest free courts, and a team's
 * next tie never starts before its previous tie's last match has ended (one team, one tie at a time).
 */
export interface PlanTie {
  id: string;
  /** Teams in the tie: the tie waits for them to be free, and keeps them busy until it ends. */
  teamIds: string[];
  matchIds: string[];
  /** Extra keys the tie must wait for (e.g. its knockout feeder ties) without being blocked by siblings. */
  waitFor?: string[];
  /** Extra keys this tie releases when it ends (e.g. "feeds the semi-final"). */
  marks?: string[];
}
export interface PlanSlot {
  matchId: string;
  tieId: string;
  court: string;
  start: number; // epoch ms
}

export function planSchedule(ties: PlanTie[], courts: string[], startMs: number, slotMinutes: number, busyUntil: Record<string, number> = {}): PlanSlot[] {
  const slot = slotMinutes * 60000;
  const courtFree = courts.map(() => startMs);
  const teamFree: Record<string, number> = { ...busyUntil };
  const out: PlanSlot[] = [];
  for (const tie of ties) {
    if (!tie.matchIds.length) continue;
    const earliest = Math.max(startMs, ...[...tie.teamIds, ...(tie.waitFor ?? [])].map((t) => teamFree[t] ?? startMs));
    let tieEnd = earliest;
    for (const matchId of tie.matchIds) {
      // earliest court available at or after the tie may start
      let best = 0;
      let bestStart = Infinity;
      courts.forEach((_, i) => {
        const s = Math.max(courtFree[i], earliest);
        if (s < bestStart) {
          bestStart = s;
          best = i;
        }
      });
      out.push({ matchId, tieId: tie.id, court: courts[best], start: bestStart });
      courtFree[best] = bestStart + slot;
      tieEnd = Math.max(tieEnd, bestStart + slot);
    }
    for (const t of [...tie.teamIds, ...(tie.marks ?? [])]) teamFree[t] = Math.max(teamFree[t] ?? 0, tieEnd);
  }
  return out;
}
