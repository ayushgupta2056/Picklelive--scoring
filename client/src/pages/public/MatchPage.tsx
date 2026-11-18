import { Link, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Clock, MapPin } from "lucide-react";
import { useT } from "@/components/public/context";
import { lineupNames, teamWash } from "@/components/public/MatchBits";
import { AnimatedNumber, CategoryBadge, EmptyState, StatusPill, TeamChip } from "@/components/match/bits";
import { CourtDiagram } from "@/components/match/CourtDiagram";
import { MomentumChart } from "@/components/match/Momentum";
import { ShareButton } from "@/components/public/Share";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatchDetail } from "@/hooks/useMatchDetail";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MatchState, Side } from "@shared/scoring/types";
import type { PublicTeam } from "@shared/api";

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("surface p-4 sm:p-5", className)} aria-label={title}>
      <h2 className="eyebrow mb-3">{title}</h2>
      {children}
    </section>
  );
}

/** Mirrored A-vs-B bars: each row shows both values and their share. */
function StatBars({ st, a, b }: { st: MatchState; a?: PublicTeam; b?: PublicTeam }) {
  const rows: [string, number, number][] = [
    ["Points won", st.stats.A.pointsWon, st.stats.B.pointsWon],
    ["Points on serve", st.stats.A.pointsOnServe, st.stats.B.pointsOnServe],
    ["Points on receive", st.stats.A.pointsOnReceive, st.stats.B.pointsOnReceive],
    ["Side outs won", st.stats.A.sideOutsWon, st.stats.B.sideOutsWon],
    ["Rallies won", st.stats.A.ralliesWon, st.stats.B.ralliesWon],
    ["Longest run", st.stats.A.longestRun, st.stats.B.longestRun],
    ["Timeouts (this game)", st.timeoutsUsed.A, st.timeoutsUsed.B],
  ];
  return (
    <div className="space-y-3">
      <div className="flex justify-between"><TeamChip team={a} size="sm" /><TeamChip team={b} size="sm" /></div>
      {rows.map(([label, x, y]) => {
        const total = x + y || 1;
        return (
          <div key={label}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className={cn("font-display text-lg font-bold tnum", x > y && "text-foreground", x < y && "text-muted-foreground")}>{x}</span>
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <span className={cn("font-display text-lg font-bold tnum", y > x && "text-foreground", y < x && "text-muted-foreground")}>{y}</span>
            </div>
            <div className="flex h-1.5 gap-1" aria-hidden>
              <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${(x / total) * 100}%`, background: a?.color }} />
              </div>
              <div className="flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${(y / total) * 100}%`, background: b?.color }} />
              </div>
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-center text-xs text-muted-foreground">
        <b className="font-display text-base text-foreground tnum">{st.stats.leadChanges}</b> lead changes · <b className="font-display text-base text-foreground tnum">{st.stats.sideOuts}</b> side outs · <b className="font-display text-base text-foreground tnum">{st.stats.totalRallies}</b> rallies
      </p>
    </div>
  );
}

export default function MatchPage() {
  const { matchId = "" } = useParams();
  const { b, lk, base } = useT();
  const reduce = useReducedMotion();
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
  const gameCols = Math.max(m.bestOf, m.games.length);
  const flag = live && st ? (st.matchPoint.length ? "Match point" : st.gamePoint.length ? "Game point" : null) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`${base}/tie/${tie.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg pr-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="h-4 w-4" /> {team("A")?.code} {tie.scoreA}–{tie.scoreB} {team("B")?.code}
        </Link>
        <span className="ml-auto"><ShareButton path={`${base}/match/${m.id}`} title={`${team("A")?.code} vs ${team("B")?.code} ${cat?.code}`} /></span>
      </div>

      {/* broadcast score bug */}
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={cn("surface relative overflow-hidden", live && "surface-live")}
        aria-label="Scoreboard"
      >
        <div className="pointer-events-none absolute inset-0" style={teamWash(team("A"), team("B"), 0.18)} aria-hidden />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5">
            <CategoryBadge category={cat} />
            <h1 className="font-display text-xl font-bold uppercase tracking-wide sm:text-2xl">{cat?.name}</h1>
            <StatusPill status={m.status} />
            <span className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
              {m.court && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{m.court}</span>}
              <span className="inline-flex items-center gap-1 tnum"><Clock className="h-3.5 w-3.5" aria-hidden />{fmtTime(m.scheduledAt, b.tournament.timezone)}</span>
            </span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] px-2 pb-2 pt-1 sm:px-3">
            <div />
            <div className="flex items-center gap-1 pr-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {Array.from({ length: gameCols }, (_, i) => <span key={i} className={cn("w-8 text-center sm:w-11", !m.games[i] && "hidden sm:inline")}>G{i + 1}</span>)}
              {live && <span className="w-16 text-center sm:w-20">Pts</span>}
            </div>
            {(["A", "B"] as Side[]).map((s) => {
              const t = team(s);
              const serving = live && st?.servingTeam === s;
              const lineup = s === "A" ? m.lineupA : m.lineupB;
              const lost = !!m.winner && m.winner !== s;
              return (
                <div key={s} className={cn("col-span-2 mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-stretch overflow-hidden rounded-xl bg-background/70", lost && "opacity-55")}>
                  <div className="flex min-w-0 items-center gap-3 border-l-4 px-2.5 py-2.5 sm:px-3 sm:py-3" style={{ borderColor: t?.color }}>
                    <TeamChip team={t} size="lg" className="hidden sm:inline-flex" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-display text-lg font-bold uppercase tracking-wide sm:text-xl"><span className="sm:hidden">{t?.code ?? "TBD"}</span><span className="hidden sm:inline">{t?.name ?? "TBD"}</span></span>
                        {serving && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-lime shadow-glow" aria-label="Serving" />}
                        {m.winner === s && <span className="rounded bg-lime px-1.5 text-[10px] font-black uppercase text-black">Win</span>}
                      </div>
                      <div className="text-xs leading-snug text-muted-foreground sm:truncate sm:text-sm">
                        {lineup?.map((id, i) => (
                          <span key={id} className={cn(st?.serverId === id && serving && "font-semibold text-lime-accent")}>{i > 0 && " / "}{lk.players.get(id)?.name}</span>
                        )) ?? lineupNames(lineup, lk.players)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 pr-1">
                    {Array.from({ length: gameCols }, (_, i) => {
                      const g = m.games[i];
                      const current = live && i === m.games.length - 1;
                      const v = g && !current ? (s === "A" ? g.a : g.b) : null;
                      const won = g?.winner === s;
                      return (
                        <span key={i} className={cn("h-10 w-8 place-items-center rounded-md font-display text-xl font-bold tnum sm:w-11", g ? "grid" : "hidden sm:grid", won ? "bg-foreground/10 text-foreground" : "text-muted-foreground")}>
                          {v ?? (current ? "·" : "–")}
                        </span>
                      );
                    })}
                    {live && curGame && (
                      <span className={cn("score-display grid h-full min-h-12 w-16 place-items-center rounded-lg text-4xl sm:w-20 sm:text-5xl", serving ? "bg-lime text-black" : "bg-foreground/[0.06]")}>
                        <AnimatedNumber value={s === "A" ? curGame.a : curGame.b} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {live && st && (
            <div className="flex min-h-12 flex-wrap items-center gap-2 border-t px-4 py-2.5 text-sm sm:px-5">
              <span className="eyebrow">Game {st.gameIndex + 1}</span>
              <span className="rounded-md border px-2 py-0.5 font-display text-lg font-bold tnum" aria-label={`Score call ${st.call}`}>{st.call}</span>
              {flag && <span className="rounded-md bg-lime px-2 py-0.5 text-xs font-black uppercase tracking-wider text-black">{flag}</span>}
              {st.switchEndsAlert && <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-black uppercase tracking-wider">Switch ends</span>}
              {st.activeTimeout && <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-black">{st.activeTimeout.medical ? "Medical timeout" : "Timeout"} {team(st.activeTimeout.team)?.code}</span>}
            </div>
          )}
        </div>
      </motion.section>

      {!st ? (
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div>
      ) : st.phase === "NOT_STARTED" ? (
        <EmptyState title="Match hasn't started">{m.lineupA || m.lineupB ? "Lineups are in. Live scores appear here automatically." : "Lineups will appear once both teams submit them."}</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {live && (
            <Panel title="On court">
              <CourtDiagram state={st} teamA={team("A")} teamB={team("B")} players={lk.players} />
            </Panel>
          )}
          <Panel title="Momentum"><MomentumChart state={st} teamA={team("A")} teamB={team("B")} /></Panel>
          <Panel title="Match stats"><StatBars st={st} a={team("A")} b={team("B")} /></Panel>
          <Panel title="Point by point">
            <ol className="max-h-96 space-y-1 overflow-y-auto pr-1 text-sm" aria-label="Point timeline, newest first">
              {[...st.timeline].reverse().map((t, i) => {
                const wt = team(t.winner);
                const prev = st.timeline[st.timeline.length - 2 - i];
                const newGame = !prev || prev.game !== t.game;
                return (
                  <li key={i}>
                    <div className="flex min-h-10 items-center gap-2.5 rounded-lg px-2 py-1.5 odd:bg-muted/40">
                      <span className="w-1 self-stretch rounded-full" style={{ background: wt?.color }} aria-hidden />
                      <TeamChip team={wt} size="sm" />
                      <span className={cn("flex-1 text-xs", t.pointTo ? "font-semibold" : "text-muted-foreground")}>
                        {t.outcome === "POINT" ? "Point" : t.outcome === "SIDE_OUT" ? (t.pointTo ? "Point · side out" : "Side out") : "Second server"}
                      </span>
                      <span className="text-[11px] text-muted-foreground tnum">R{t.rally}</span>
                      <span className="w-14 text-right font-display text-lg font-bold tnum">{t.a}-{t.b}</span>
                    </div>
                    {newGame && <div className="eyebrow px-2 py-1.5 text-center">Game {t.game} start</div>}
                  </li>
                );
              })}
            </ol>
          </Panel>
        </div>
      )}
    </div>
  );
}
