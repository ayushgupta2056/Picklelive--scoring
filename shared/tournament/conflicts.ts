export interface ScheduledItem {
  id: string;
  label: string;
  court: string | null;
  start: Date | null;
  durationMin: number;
  playerIds: string[];
}

export interface Conflict {
  kind: "COURT_OVERLAP" | "PLAYER_DOUBLE_BOOKED" | "REST_GAP";
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
  return out;
}
