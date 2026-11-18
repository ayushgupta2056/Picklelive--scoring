export interface ScheduledItem {
  id: string;
  label: string;
  court: string | null;
  start: Date | null;
  durationMin: number;
  playerIds: string[];
  /** Tie the match belongs to, and that tie's two teams (for the one-tie-at-a-time rule). */
  tieId?: string;
  teamIds?: string[];
  tieLabel?: string;
}

export interface Conflict {
  kind: "COURT_OVERLAP" | "PLAYER_DOUBLE_BOOKED" | "REST_GAP" | "TEAM_OVERLAP";
  matchIds: string[];
  message: string;
}

const end = (m: ScheduledItem) => new Date(m.start!.getTime() + m.durationMin * 60000);

export function findConflicts(items: ScheduledItem[], restGapMinutes = 15, playerNames: Record<string, string> = {}): Conflict[] {
  const out: Conflict[] = [];
  const timed = items.filter((m) => m.start).sort((a, b) => a.start!.getTime() - b.start!.getTime());
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      const overlap = b.start!.getTime() < end(a).getTime();
      if (overlap && a.court && a.court === b.court) {
        out.push({ kind: "COURT_OVERLAP", matchIds: [a.id, b.id], message: `${a.court}: ${a.label} overlaps ${b.label}` });
      }
      const shared = a.playerIds.filter((p) => b.playerIds.includes(p));
      if (!shared.length) continue;
      const who = shared.map((p) => playerNames[p] ?? p).join(", ");
      if (overlap) {
        out.push({ kind: "PLAYER_DOUBLE_BOOKED", matchIds: [a.id, b.id], message: `${who} double-booked: ${a.label} and ${b.label}` });
      } else {
        const gap = (b.start!.getTime() - end(a).getTime()) / 60000;
        if (gap < restGapMinutes) {
          out.push({ kind: "REST_GAP", matchIds: [a.id, b.id], message: `${who}: only ${Math.round(gap)} min rest between ${a.label} and ${b.label}` });
        }
      }
    }
  }
  // One team, one tie at a time: a team's ties must not overlap in time.
  const ties = new Map<string, { start: number; end: number; teamIds: string[]; label: string; ids: string[] }>();
  for (const m of timed) {
    if (!m.tieId || !m.teamIds?.length) continue;
    const w = ties.get(m.tieId) ?? { start: Infinity, end: -Infinity, teamIds: m.teamIds, label: m.tieLabel ?? m.tieId, ids: [] };
    w.start = Math.min(w.start, m.start!.getTime());
    w.end = Math.max(w.end, end(m).getTime());
    w.ids.push(m.id);
    ties.set(m.tieId, w);
  }
  const list = [...ties.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const shared = a.teamIds.filter((t) => b.teamIds.includes(t));
      if (!shared.length || !(a.start < b.end && b.start < a.end)) continue;
      out.push({ kind: "TEAM_OVERLAP", matchIds: [...a.ids, ...b.ids], message: `${shared.map((t) => playerNames[t] ?? t).join(", ")} would play two ties at once: ${a.label} and ${b.label}` });
    }
  }
  return out;
}
