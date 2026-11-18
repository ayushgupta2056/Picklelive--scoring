import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/format";
import { AnimatedNumber, CategoryBadge, LiveDot, StatusPill, TeamChip } from "@/components/match/bits";
import type { MatchSummary, TieSummary } from "@shared/api";
import { useT } from "./context";

export function lineupNames(ids: string[] | null, players: ReturnType<typeof useT>["lk"]["players"], short = false) {
  if (!ids?.length) return "TBD";
  return ids.map((id) => {
    const n = players.get(id)?.name ?? "?";
    return short ? n.split(" ")[0] : n;
  }).join(" / ");
}

/** Compact chip for one category match inside a tie. */
export function MatchChip({ m, tie }: { m: MatchSummary; tie: TieSummary }) {
  const { lk, base, b } = useT();
  const cat = lk.categories.get(m.categoryId);
  const live = m.status === "LIVE" || m.status === "PAUSED";
  const done = ["FINISHED", "WALKOVER", "RETIRED"].includes(m.status);
  const winTeam = m.winner === "A" ? lk.teams.get(tie.teamAId ?? "") : m.winner === "B" ? lk.teams.get(tie.teamBId ?? "") : null;
  return (
    <Link
      to={`${base}/match/${m.id}`}
      className={cn("flex min-h-12 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent", live && "border-live/60 bg-live/5", m.status === "NOT_REQUIRED" && "opacity-50")}
      aria-label={`${cat?.name} ${m.status}`}
    >
      <CategoryBadge category={cat} />
      {live && m.live ? (
        <span className="flex items-center gap-1.5 font-bold tnum"><LiveDot className="h-2 w-2" /> G{m.games.length} {m.live.score.a}-{m.live.score.b}</span>
      ) : done ? (
        <span className="flex items-center gap-1 font-bold tnum">
          <TeamChip team={winTeam} size="sm" className="h-5 min-w-8 text-[10px]" />
          <span title={m.games.filter((g) => g.winner).map((g) => `${g.a}-${g.b}`).join(", ")}>{m.status === "FINISHED" ? `${m.gamesA}–${m.gamesB}` : m.status === "WALKOVER" ? "w/o" : "ret."}</span>
        </span>
      ) : m.status === "NOT_REQUIRED" ? (
        <span className="text-muted-foreground">not required</span>
      ) : (
        <span className="text-muted-foreground">{m.isDecider ? "decider · " : ""}{fmtTime(m.scheduledAt, b.tournament.timezone)}</span>
      )}
    </Link>
  );
}

export function TieScoreLine({ tie, big }: { tie: TieSummary; big?: boolean }) {
  const { lk } = useT();
  const a = lk.teams.get(tie.teamAId ?? "");
  const bTeam = lk.teams.get(tie.teamBId ?? "");
  const winA = tie.winner === "A";
  const winB = tie.winner === "B";
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      <div className={cn("flex min-w-0 flex-1 items-center justify-end gap-2 text-right", tie.winner && !winA && "opacity-60")}>
        <span className={cn("truncate font-bold", big ? "text-lg sm:text-2xl" : "text-sm sm:text-base")}>{a?.name ?? "TBD"}</span>
        <TeamChip team={a} size={big ? "lg" : "md"} />
      </div>
      <div className={cn("flex shrink-0 items-center gap-1 font-black tnum", big ? "text-4xl sm:text-6xl" : "text-2xl")}>
        <span data-testid="tie-score-a"><AnimatedNumber value={tie.scoreA} className={cn(winA && "text-lime-accent")} /></span>
        <span className="text-muted-foreground">–</span>
        <span data-testid="tie-score-b"><AnimatedNumber value={tie.scoreB} className={cn(winB && "text-lime-accent")} /></span>
      </div>
      <div className={cn("flex min-w-0 flex-1 items-center gap-2", tie.winner && !winB && "opacity-60")}>
        <TeamChip team={bTeam} size={big ? "lg" : "md"} />
        <span className={cn("truncate font-bold", big ? "text-lg sm:text-2xl" : "text-sm sm:text-base")}>{bTeam?.name ?? "TBD"}</span>
      </div>
    </div>
  );
}

export function TieCard({ tie, big }: { tie: TieSummary; big?: boolean }) {
  const { base, b } = useT();
  const live = tie.matches.some((m) => m.status === "LIVE");
  return (
    <motion.article layout className={cn("rounded-2xl border bg-card p-3 sm:p-4", live && "border-live/40 shadow-[0_0_0_1px_rgba(255,59,92,.15)]")}>
      <Link to={`${base}/tie/${tie.id}`} className="block">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate font-semibold">{tie.roundLabel ?? `Round ${tie.round}`}</span>
          {live ? <StatusPill status="LIVE" /> : tie.status === "FINISHED" ? <span className="font-bold uppercase">Final{tie.winner === "DRAW" ? " · draw" : ""}</span> : tie.status === "DECIDED" ? <span className="font-bold uppercase text-lime-accent">Decided</span> : <span>{fmtTime(tie.scheduledAt ?? tie.matches[0]?.scheduledAt, b.tournament.timezone)}</span>}
        </div>
        <TieScoreLine tie={tie} big={big} />
      </Link>
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {tie.matches.map((m) => <MatchChip key={m.id} m={m} tie={tie} />)}
      </div>
    </motion.article>
  );
}

/** Live match card: court, players, games, server indicator. */
export function LiveMatchCard({ m }: { m: MatchSummary }) {
  const { lk, base } = useT();
  const tie = lk.ties.get(m.tieId)!;
  const cat = lk.categories.get(m.categoryId);
  const row = (side: "A" | "B") => {
    const team = lk.teams.get((side === "A" ? tie.teamAId : tie.teamBId) ?? "");
    const ids = side === "A" ? m.lineupA : m.lineupB;
    const serving = m.live?.servingTeam === side && m.status === "LIVE";
    return (
      <div className="flex items-center gap-2">
        <TeamChip team={team} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm">
          {ids?.map((id) => (
            <span key={id} className={cn("mr-1", m.live?.serverId === id && serving && "font-bold text-lime-accent")}>{lk.players.get(id)?.name.split(" ")[0]}</span>
          )) ?? "TBD"}
        </span>
        {serving && <span className="h-2.5 w-2.5 rounded-full bg-lime animate-glow" aria-label="serving" />}
        <span className="flex gap-1 text-xs text-muted-foreground tnum">
          {m.games.slice(0, -1).map((g, i) => <span key={i} className={cn((side === "A" ? g.a > g.b : g.b > g.a) && "font-bold text-foreground")}>{side === "A" ? g.a : g.b}</span>)}
        </span>
        <span className="w-9 text-right text-2xl font-black tnum"><AnimatedNumber value={m.live ? (side === "A" ? m.live.score.a : m.live.score.b) : 0} /></span>
      </div>
    );
  };
  return (
    <Link to={`${base}/match/${m.id}`} className="block rounded-2xl border border-live/40 bg-card p-3 transition-colors hover:bg-accent/40">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <LiveDot />
        <span className="font-bold uppercase text-live">{m.status === "PAUSED" ? "Paused" : "Live"}</span>
        <CategoryBadge category={cat} />
        <span className="ml-auto text-muted-foreground">{m.court ?? ""} · G{m.games.length}</span>
      </div>
      <div className="space-y-1.5">{row("A")}{row("B")}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {m.live && <span className="rounded bg-muted px-1.5 py-0.5 font-bold tnum">{m.live.call}</span>}
        {m.live?.matchPoint.length ? <span className="rounded bg-lime px-1.5 py-0.5 font-black text-black">MATCH POINT</span> : m.live?.gamePoint.length ? <span className="rounded bg-lime/80 px-1.5 py-0.5 font-black text-black">GAME POINT</span> : null}
        {m.live?.switchEndsAlert && <span className="rounded bg-secondary px-1.5 py-0.5 font-bold">SWITCH ENDS</span>}
      </div>
    </Link>
  );
}
