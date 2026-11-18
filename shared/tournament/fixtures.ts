/** Round-robin pairings via the circle method. Returns rounds of [home, away] pairs (byes omitted). */
export function roundRobin<T>(teams: T[], doubleRound = false): [T, T][][] {
  const list: (T | null)[] = [...teams];
  if (list.length < 2) return [];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: [T, T][][] = [];
  const arr = [...list];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [T, T][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a == null || b == null) continue;
      // alternate home/away so the fixed team isn't always "A"
      pairs.push(r % 2 === 0 || i > 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // rotate all but the first element
    arr.splice(1, 0, arr.pop() as T | null);
  }
  if (doubleRound) {
    const second = rounds.map((rd) => rd.map(([a, b]) => [b, a] as [T, T]));
    return [...rounds, ...second];
  }
  return rounds;
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Standard seeded bracket order, e.g. size 8 -> [1,8,4,5,2,7,3,6]. */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((s) => [s, sum - s]);
  }
  return order;
}

export interface BracketMatchSpec {
  round: number; // 1 = first round
  pos: number; // 0-based position in round
  seedA: number | null; // seed number (1-based) or null if fed by previous round
  seedB: number | null;
  label: string;
}

export function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semi-final";
  if (fromEnd === 2) return "Quarter-final";
  return `Round of ${2 ** (fromEnd + 1)}`;
}

/** Build a single-elimination bracket for `teamCount` seeded teams. Seeds beyond teamCount are byes. */
export function bracket(teamCount: number): { size: number; rounds: number; matches: BracketMatchSpec[] } {
  const size = Math.max(2, nextPow2(teamCount));
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const matches: BracketMatchSpec[] = [];
  for (let i = 0; i < size / 2; i++) {
    const a = order[2 * i];
    const b = order[2 * i + 1];
    matches.push({ round: 1, pos: i, seedA: a <= teamCount ? a : null, seedB: b <= teamCount ? b : null, label: roundLabel(1, rounds) });
  }
  for (let r = 2; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let i = 0; i < count; i++) matches.push({ round: r, pos: i, seedA: null, seedB: null, label: roundLabel(r, rounds) });
  }
  return { size, rounds, matches };
}

/** Cross-group qualifier seeding: A1, B1, ... then A2, B2 ... arranged so group winners meet runners-up. */
export function crossSeed(groups: string[][], qualifiers: number): string[] {
  const seeds: string[] = [];
  for (let q = 0; q < qualifiers; q++) {
    const row = groups.map((g) => g[q]).filter(Boolean);
    // reverse every other row so A1 meets B2 rather than A2
    seeds.push(...(q % 2 === 0 ? row : row.reverse()));
  }
  return seeds;
}
