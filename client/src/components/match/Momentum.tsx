import type { MatchState } from "@shared/scoring/types";
import type { PublicTeam } from "@shared/api";

/** Running point differential (A minus B) across the match, one step per point scored. */
export function MomentumChart({ state, teamA, teamB }: { state: MatchState; teamA?: PublicTeam | null; teamB?: PublicTeam | null }) {
  const pts = state.timeline.filter((t) => t.pointTo);
  if (pts.length < 2) return <p className="text-sm text-muted-foreground">Momentum appears after a few points.</p>;
  let d = 0;
  const series = [0, ...pts.map((t) => (d += t.pointTo === "A" ? 1 : -1))];
  const max = Math.max(3, ...series.map(Math.abs));
  const W = 600;
  const H = 160;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H / 2 - (v / max) * (H / 2 - 8);
  const path = series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const gameBreaks: number[] = [];
  pts.forEach((t, i) => i > 0 && pts[i - 1].game !== t.game && gameBreaks.push(i));
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label="Momentum chart">
        <defs>
          <clipPath id="above"><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
          <clipPath id="below"><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
        </defs>
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="currentColor" strokeOpacity=".2" />
        {gameBreaks.map((i) => <line key={i} x1={x(i)} x2={x(i)} y1="0" y2={H} stroke="currentColor" strokeOpacity=".15" strokeDasharray="4 4" />)}
        <path d={`${path}L${W},${H / 2}L0,${H / 2}Z`} fill={teamA?.color ?? "#3B82F6"} fillOpacity=".35" clipPath="url(#above)" />
        <path d={`${path}L${W},${H / 2}L0,${H / 2}Z`} fill={teamB?.color ?? "#EF4444"} fillOpacity=".35" clipPath="url(#below)" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-xs text-muted-foreground"><span>▲ {teamA?.code} ahead</span><span>▼ {teamB?.code} ahead</span></figcaption>
    </figure>
  );
}
