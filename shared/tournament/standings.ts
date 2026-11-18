export type Tiebreak = "TIE_POINTS" | "HEAD_TO_HEAD" | "MATCH_DIFF" | "GAME_DIFF" | "POINT_DIFF" | "POINTS_FOR";
export const DEFAULT_TIEBREAKS: Tiebreak[] = ["TIE_POINTS", "HEAD_TO_HEAD", "MATCH_DIFF", "GAME_DIFF", "POINT_DIFF", "POINTS_FOR"];

export interface PointsSystem {
  win: number;
  draw: number;
  loss: number;
}

export interface StandingMatchInput {
  winner: "A" | "B" | null;
  games: { a: number; b: number }[];
}

export interface StandingTieInput {
  id: string;
  teamAId: string;
  teamBId: string;
  /** Only finished ties count toward standings. */
  finished: boolean;
  winner: "A" | "B" | "DRAW" | null;
  matches: StandingMatchInput[];
}

export interface StandingRow {
  teamId: string;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  matchesWon: number;
  matchesLost: number;
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  tiePoints: number;
}

function blank(teamId: string): StandingRow {
  return { teamId, rank: 0, played: 0, won: 0, drawn: 0, lost: 0, matchesWon: 0, matchesLost: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0, pointDiff: 0, tiePoints: 0 };
}

export function computeStandings(
  teamIds: string[],
  ties: StandingTieInput[],
  points: PointsSystem = { win: 2, draw: 1, loss: 0 },
  order: Tiebreak[] = DEFAULT_TIEBREAKS,
): StandingRow[] {
  const rows = new Map(teamIds.map((id) => [id, blank(id)]));
  const done = ties.filter((t) => t.finished && t.winner && rows.has(t.teamAId) && rows.has(t.teamBId));
  for (const t of done) {
    const a = rows.get(t.teamAId)!;
    const b = rows.get(t.teamBId)!;
    a.played++;
    b.played++;
    if (t.winner === "DRAW") {
      a.drawn++;
      b.drawn++;
      a.tiePoints += points.draw;
      b.tiePoints += points.draw;
    } else {
      const [w, l] = t.winner === "A" ? [a, b] : [b, a];
      w.won++;
      l.lost++;
      w.tiePoints += points.win;
      l.tiePoints += points.loss;
    }
    for (const m of t.matches) {
      if (!m.winner) continue;
      if (m.winner === "A") {
        a.matchesWon++;
        b.matchesLost++;
      } else {
        b.matchesWon++;
        a.matchesLost++;
      }
      for (const g of m.games) {
        a.pointsFor += g.a;
        a.pointsAgainst += g.b;
        b.pointsFor += g.b;
        b.pointsAgainst += g.a;
        if (g.a > g.b) {
          a.gamesWon++;
          b.gamesLost++;
        } else if (g.b > g.a) {
          b.gamesWon++;
          a.gamesLost++;
        }
      }
    }
  }
  for (const r of rows.values()) r.pointDiff = r.pointsFor - r.pointsAgainst;

  const metric = (r: StandingRow, tb: Tiebreak): number => {
    switch (tb) {
      case "TIE_POINTS": return r.tiePoints;
      case "MATCH_DIFF": return r.matchesWon - r.matchesLost;
      case "GAME_DIFF": return r.gamesWon - r.gamesLost;
      case "POINT_DIFF": return r.pointDiff;
      case "POINTS_FOR": return r.pointsFor;
      default: return 0;
    }
  };

  /** Head-to-head: tie points earned only in ties among the given cluster of teams. */
  const h2hPoints = (teamId: string, cluster: Set<string>): number => {
    let pts = 0;
    for (const t of done) {
      if (!cluster.has(t.teamAId) || !cluster.has(t.teamBId)) continue;
      if (t.teamAId !== teamId && t.teamBId !== teamId) continue;
      const side = t.teamAId === teamId ? "A" : "B";
      pts += t.winner === "DRAW" ? points.draw : t.winner === side ? points.win : points.loss;
    }
    return pts;
  };

  const rank = (cluster: StandingRow[], idx: number): StandingRow[] => {
    if (cluster.length <= 1 || idx >= order.length) return [...cluster].sort((x, y) => x.teamId.localeCompare(y.teamId));
    const tb = order[idx];
    const ids = new Set(cluster.map((r) => r.teamId));
    const value = (r: StandingRow) => (tb === "HEAD_TO_HEAD" ? h2hPoints(r.teamId, ids) : metric(r, tb));
    const buckets = new Map<number, StandingRow[]>();
    for (const r of cluster) {
      const v = value(r);
      buckets.set(v, [...(buckets.get(v) ?? []), r]);
    }
    return [...buckets.entries()].sort((a, b) => b[0] - a[0]).flatMap(([, rs]) => rank(rs, idx + 1));
  };

  const sorted = rank([...rows.values()], 0);
  sorted.forEach((r, i) => (r.rank = i + 1));
  return sorted;
}
