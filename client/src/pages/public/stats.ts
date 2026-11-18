import type { TournamentBundle } from "@shared/api";

export interface PlayerStat {
  played: number;
  won: number;
  lost: number;
  pointsWon: number;
  categories: Set<string>;
  matchIds: string[];
}

export function playerStats(b: TournamentBundle): Map<string, PlayerStat> {
  const out = new Map<string, PlayerStat>();
  for (const t of b.ties) {
    for (const m of t.matches) {
      for (const side of ["A", "B"] as const) {
        const ids = side === "A" ? m.lineupA : m.lineupB;
        if (!ids) continue;
        for (const id of ids) {
          const s = out.get(id) ?? { played: 0, won: 0, lost: 0, pointsWon: 0, categories: new Set(), matchIds: [] };
          out.set(id, s);
          s.matchIds.push(m.id);
          s.categories.add(m.categoryId);
          s.pointsWon += m.games.reduce((n, g) => n + (side === "A" ? g.a : g.b), 0);
          if (m.winner) {
            s.played++;
            if (m.winner === side) s.won++;
            else s.lost++;
          }
        }
      }
    }
  }
  return out;
}
