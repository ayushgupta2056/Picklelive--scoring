import { Link, useParams } from "react-router-dom";
import { useT } from "@/components/public/context";
import { lineupNames } from "@/components/public/MatchBits";
import { AnimatedNumber, CategoryBadge, EmptyState, StatusPill, TeamChip } from "@/components/match/bits";
import { CourtDiagram } from "@/components/match/CourtDiagram";
import { MomentumChart } from "@/components/match/Momentum";
import { ShareButton } from "@/components/public/Share";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatchDetail } from "@/hooks/useMatchDetail";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Side } from "@shared/scoring/types";

export default function MatchPage() {
  const { matchId = "" } = useParams();
  const { b, lk, base } = useT();
  const q = useMatchDetail(matchId);
  const summary = lk.matches.get(matchId);
  if (!summary) return <EmptyState title="Match not found" />;
  const tie = lk.ties.get(summary.tieId)!;
  const m = q.data?.match ?? summary;
  const st = q.data?.state;
  const cat = lk.categories.get(m.categoryId);
  const team = (s: Side) => lk.teams.get((s === "A" ? tie.teamAId : tie.teamBId) ?? "");
  const live = m.status === "LIVE" || m.status === "PAUSED";
  const curGame = st?.games[st.gameIndex];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={cat} />
        <h1 className="text-lg font-black">{cat?.name}</h1>
        <StatusPill status={m.status} />
        <span className="text-sm text-muted-foreground">{m.court} · {fmtTime(m.scheduledAt, b.tournament.timezone)}</span>
        <span className="ml-auto"><ShareButton path={`${base}/match/${m.id}`} title={`${team("A")?.code} vs ${team("B")?.code} ${cat?.code}`} /></span>
      </div>
      <Link to={`${base}/tie/${tie.id}`} className="block text-sm text-muted-foreground hover:underline">
        Tie: {team("A")?.name} {tie.scoreA}–{tie.scoreB} {team("B")?.name} →
      </Link>

      {/* scoreboard */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        {(["A", "B"] as Side[]).map((s) => {
          const serving = live && st?.servingTeam === s;
          const lineup = s === "A" ? m.lineupA : m.lineupB;
          return (
            <div key={s} className={cn("flex items-center gap-3 border-b p-3 last:border-b-0 sm:p-4", m.winner && m.winner !== s && "opacity-60")}>
              <TeamChip team={team(s)} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{team(s)?.name ?? "TBD"}</div>
                <div className="truncate text-sm text-muted-foreground">{lineupNames(lineup, lk.players)}</div>
              </div>
              {serving && <span className="h-3.5 w-3.5 rounded-full bg-lime animate-glow" aria-label="Serving" />}
              <div className="flex gap-2 text-lg font-bold text-muted-foreground tnum">
                {m.games.map((g, i) => (i === m.games.length - 1 && live ? null : <span key={i} className={cn((s === "A" ? g.a > g.b : g.b > g.a) && "text-foreground")}>{s === "A" ? g.a : g.b}</span>))}
              </div>
              {live && curGame && <span className="w-14 text-right text-4xl font-black tnum sm:text-5xl"><AnimatedNumber value={s === "A" ? curGame.a : curGame.b} /></span>}
            </div>
          );
        })}
        {live && st && (
          <div className="flex flex-wrap items-center gap-2 bg-muted/40 px-4 py-2 text-sm">
            <span className="font-bold">Game {st.gameIndex + 1}</span>
            <span className="rounded bg-background px-2 py-0.5 font-black tnum">{st.call}</span>
            {st.matchPoint.length > 0 ? <span className="rounded bg-lime px-2 py-0.5 text-xs font-black text-black">MATCH POINT</span> : st.gamePoint.length > 0 && <span className="rounded bg-lime px-2 py-0.5 text-xs font-black text-black">GAME POINT</span>}
            {st.switchEndsAlert && <span className="rounded bg-secondary px-2 py-0.5 text-xs font-black">SWITCH ENDS</span>}
            {st.activeTimeout && <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-black text-black">{st.activeTimeout.medical ? "MEDICAL TIMEOUT" : "TIMEOUT"} {team(st.activeTimeout.team)?.code}</span>}
          </div>
        )}
      </div>

      {!st ? <Skeleton className="h-48" /> : st.phase === "NOT_STARTED" ? (
        <EmptyState title="Match hasn't started">{m.lineupA || m.lineupB ? "Lineups are in. Live scores appear here automatically." : "Lineups will appear once both teams submit them."}</EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {live && (
            <section>
              <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-muted-foreground">On court</h2>
              <CourtDiagram state={st} teamA={team("A")} teamB={team("B")} players={lk.players} />
            </section>
          )}
          <section>
            <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-muted-foreground">Momentum</h2>
            <MomentumChart state={st} teamA={team("A")} teamB={team("B")} />
          </section>
          <section>
            <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-muted-foreground">Stats</h2>
            <table className="w-full text-sm tnum">
              <thead><tr className="text-xs text-muted-foreground"><th className="text-left" /><th className="text-right">{team("A")?.code}</th><th className="text-right">{team("B")?.code}</th></tr></thead>
              <tbody>
                {([
                  ["Points won", "pointsWon"], ["Points on serve", "pointsOnServe"], ["Points on receive", "pointsOnReceive"], ["Side outs won", "sideOutsWon"], ["Longest run", "longestRun"], ["Rallies won", "ralliesWon"],
                ] as const).map(([l, k]) => <tr key={k} className="border-t"><td className="py-1.5">{l}</td><td className="text-right font-bold">{st.stats.A[k]}</td><td className="text-right font-bold">{st.stats.B[k]}</td></tr>)}
                <tr className="border-t"><td className="py-1.5">Lead changes</td><td colSpan={2} className="text-right font-bold">{st.stats.leadChanges}</td></tr>
                <tr className="border-t"><td className="py-1.5">Timeouts used (this game)</td><td className="text-right font-bold">{st.timeoutsUsed.A}</td><td className="text-right font-bold">{st.timeoutsUsed.B}</td></tr>
              </tbody>
            </table>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-muted-foreground">Point timeline</h2>
            <ol className="max-h-80 space-y-1 overflow-y-auto pr-1 text-sm">
              {[...st.timeline].reverse().map((t, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg px-2 py-1 odd:bg-muted/40">
                  <span className="w-10 text-xs text-muted-foreground tnum">G{t.game}·{t.rally}</span>
                  <TeamChip team={team(t.winner)} size="sm" />
                  <span className="flex-1 text-xs">{t.outcome === "POINT" ? "point" : t.outcome === "SIDE_OUT" ? (t.pointTo ? "point · side out" : "side out") : "second server"}</span>
                  <span className="font-bold tnum">{t.a}-{t.b}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
