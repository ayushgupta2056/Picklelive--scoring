import { useId } from "react";
import type { MatchState } from "@shared/scoring/types";
import type { PublicTeam } from "@shared/api";

/** Running point differential (A minus B), one step per point scored, with game boundaries and a text summary. */
export function MomentumChart({ state, teamA, teamB }: { state: MatchState; teamA?: PublicTeam | null; teamB?: PublicTeam | null }) {
  const uid = useId().replace(/:/g, "");
  const pts = state.timeline.filter((t) => t.pointTo);
  if (pts.length < 2) return <p className="py-8 text-center text-sm text-muted-foreground">Momentum appears after a few points.</p>;
  let d = 0;
  const series = [0, ...pts.map((t) => (d += t.pointTo === "A" ? 1 : -1))];
  const peakA = Math.max(0, ...series);
  const peakB = Math.max(0, ...series.map((v) => -v));
  const max = Math.max(3, peakA, peakB);
  const W = 600;
  const H = 180;
  const PAD = 10;
  // Step-after chart: value i holds from x(i) to x(i+1); series.length segments across the width.
  const x = (i: number) => (i / series.length) * W;
  const y = (v: number) => H / 2 - (v / max) * (H / 2 - PAD);
  // stepped path: momentum moves one point at a time
  const path = series.map((v, i) => (i ? `H${x(i).toFixed(1)}V${y(v).toFixed(1)}` : `M0,${y(v).toFixed(1)}`)).join("") + `H${W}`;
  const area = `${path}V${H / 2}H0Z`;
  const breaks: { i: number; game: number }[] = [{ i: 0, game: pts[0].game }];
  pts.forEach((t, i) => i > 0 && pts[i - 1].game !== t.game && breaks.push({ i, game: t.game }));
  const ca = teamA?.color ?? "#3B82F6";
  const cb = teamB?.color ?? "#EF4444";
  const now = series[series.length - 1];
  const leader = now > 0 ? teamA : now < 0 ? teamB : null;
  const summary = leader
    ? `${leader.code} lead the run of play by ${Math.abs(now)} point${Math.abs(now) === 1 ? "" : "s"}`
    : "Run of play level";

  return (
    <figure>
      <p className="mb-2 font-display text-lg font-bold uppercase tracking-wide" role="status">{summary}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full overflow-visible" role="img" aria-label={`Momentum chart. ${summary}. Biggest lead ${teamA?.code} ${peakA}, ${teamB?.code} ${peakB}.`}>
        <defs>
          <linearGradient id={`ga${uid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={ca} stopOpacity=".55" />
            <stop offset="100%" stopColor={ca} stopOpacity=".05" />
          </linearGradient>
          <linearGradient id={`gb${uid}`} x1="0" x2="0" y1="1" y2="0">
            <stop offset="0%" stopColor={cb} stopOpacity=".55" />
            <stop offset="100%" stopColor={cb} stopOpacity=".05" />
          </linearGradient>
          <clipPath id={`above${uid}`}><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
          <clipPath id={`below${uid}`}><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
        </defs>
        {[0.25, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="currentColor" strokeOpacity=".06" />)}
        {breaks.slice(1).map((b) => <line key={b.i} x1={x(b.i + 1)} x2={x(b.i + 1)} y1="0" y2={H} stroke="currentColor" strokeOpacity=".2" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
        <path d={area} fill={`url(#ga${uid})`} clipPath={`url(#above${uid})`} />
        <path d={area} fill={`url(#gb${uid})`} clipPath={`url(#below${uid})`} />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="currentColor" strokeOpacity=".3" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={W} cy={y(now)} r="4" fill="#C6FF00" stroke="#000" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative mt-1 h-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground" aria-hidden>
        {breaks.map((b) => (
          <span key={b.i} className="absolute" style={{ left: `${((b.i + 1) / series.length) * 100}%` }}>G{b.game}</span>
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: ca }} aria-hidden />▲ {teamA?.code} ahead · best +{peakA}</span>
        <span className="flex items-center gap-1.5">{teamB?.code} ahead · best +{peakB} ▼<span className="h-2.5 w-2.5 rounded-sm" style={{ background: cb }} aria-hidden /></span>
      </figcaption>
    </figure>
  );
}
