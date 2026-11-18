import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/format";
import { AnimatedNumber, CategoryBadge, LiveDot, StatusPill, TeamChip, TeamLogo } from "@/components/match/bits";
import type { MatchSummary, PublicTeam, TieSummary } from "@shared/api";
import { useT } from "./context";

export function lineupNames(ids: string[] | null, players: ReturnType<typeof useT>["lk"]["players"], short = false) {
  if (!ids?.length) return "TBD";
  return ids.map((id) => {
    const n = players.get(id)?.name ?? "?";
    return short ? n.split(" ")[0] : n;
  }).join(" / ");
}

const DONE = ["FINISHED", "WALKOVER", "RETIRED"];
const isLive = (m: MatchSummary) => m.status === "LIVE" || m.status === "PAUSED";
const isDone = (m: MatchSummary) => DONE.includes(m.status);

/** Soft team-color washes from each side; the visual signature of every tie surface. */
export function teamWash(a?: PublicTeam | null, b?: PublicTeam | null, strength = 0.22): React.CSSProperties {
  const hex = (c: string | undefined, alpha: number) => `${c ?? "#3f3f46"}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
  return {
    backgroundImage: `radial-gradient(120% 140% at 0% 0%, ${hex(a?.color, strength)}, transparent 55%), radial-gradient(120% 140% at 100% 0%, ${hex(b?.color, strength)}, transparent 55%)`,
  };
}

/** Compact chip for one category match inside a tie. */
export function MatchChip({ m, tie }: { m: MatchSummary; tie: TieSummary }) {
  const { lk, base, b } = useT();
  const cat = lk.categories.get(m.categoryId);
  const live = isLive(m);
  const done = isDone(m);
  const winTeam = m.winner === "A" ? lk.teams.get(tie.teamAId ?? "") : m.winner === "B" ? lk.teams.get(tie.teamBId ?? "") : null;
  return (
    <Link
      to={`${base}/match/${m.id}`}
      className={cn(
        "group flex min-h-12 items-center gap-2 rounded-xl border bg-background/40 px-2.5 py-1.5 text-xs transition-colors duration-200 hover:border-foreground/25 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        live && "border-live/50 bg-live/[0.07]",
        m.status === "NOT_REQUIRED" && "opacity-45",
      )}
      aria-label={`${cat?.name}: ${live ? "live" : done ? "final" : m.status === "NOT_REQUIRED" ? "not required" : "upcoming"}`}
    >
      <CategoryBadge category={cat} />
      {live && m.live ? (
        <span className="ml-auto flex items-center gap-1.5 font-display text-base font-bold tnum">
          <LiveDot className="h-2 w-2" />
          {m.live.score.a}<span className="text-muted-foreground">-</span>{m.live.score.b}
        </span>
      ) : done ? (
        <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background" style={{ background: winTeam?.color }} title={`${winTeam?.name} won`} aria-label={`${winTeam?.code} won`} />
          <span className="font-display text-xs font-bold uppercase text-muted-foreground">{winTeam?.code}</span>
          <span className="font-display text-base font-bold tnum" title={m.games.filter((g) => g.winner).map((g) => `${g.a}-${g.b}`).join(", ")}>
            {m.status === "FINISHED" ? `${m.gamesA}–${m.gamesB}` : m.status === "WALKOVER" ? "W/O" : "RET"}
          </span>
        </span>
      ) : m.status === "NOT_REQUIRED" ? (
        <span className="ml-auto text-muted-foreground">n/r</span>
      ) : (
        <span className="ml-auto font-medium text-muted-foreground tnum">{m.isDecider ? "If needed" : fmtTime(m.scheduledAt, b.tournament.timezone)}</span>
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
  // Mobile: logo stacked above the name (names get the full column); sm+: logo beside the name.
  const side = (team: PublicTeam | undefined, align: "left" | "right", lost: boolean) => (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3", align === "left" ? "sm:text-left" : "sm:flex-row-reverse sm:text-right", lost && "opacity-55")}>
      {big ? <TeamLogo team={team} className="h-11 w-11 shrink-0 rounded-xl text-sm sm:h-14 sm:w-14" /> : <TeamChip team={team} />}
      <span className={cn("w-full min-w-0 font-display font-bold uppercase leading-[1.05] tracking-wide sm:w-auto", big ? "text-base sm:text-3xl" : "text-sm sm:text-lg")}>
        <span className="line-clamp-2 [overflow-wrap:anywhere]">{team?.name ?? "TBD"}</span>
      </span>
    </div>
  );
  return (
    <div className="flex items-center gap-2 sm:gap-5">
      {side(a, "left", !!tie.winner && !winA)}
      <div className={cn("score-display flex shrink-0 items-baseline gap-1.5 sm:gap-3", big ? "text-[3.25rem] sm:text-8xl" : "text-4xl")}>
        <span data-testid="tie-score-a"><AnimatedNumber value={tie.scoreA} className={cn(winA && "text-lime-accent text-glow")} /></span>
        <span className="text-[0.55em] text-muted-foreground/60">:</span>
        <span data-testid="tie-score-b"><AnimatedNumber value={tie.scoreB} className={cn(winB && "text-lime-accent text-glow")} /></span>
      </div>
      {side(bTeam, "right", !!tie.winner && !winB)}
    </div>
  );
}

/** Segmented progress of a tie: one segment per category slot, filled in the winning team's color. */
export function TieProgress({ tie }: { tie: TieSummary }) {
  const { lk } = useT();
  return (
    <div className="flex gap-1" aria-hidden>
      {tie.matches.map((m) => {
        const t = m.winner ? lk.teams.get((m.winner === "A" ? tie.teamAId : tie.teamBId) ?? "") : null;
        return (
          <span
            key={m.id}
            className={cn("h-1.5 flex-1 rounded-full bg-muted", isLive(m) && "bg-live/70 motion-safe:animate-pulse", m.status === "NOT_REQUIRED" && "opacity-30")}
            style={t ? { background: t.color } : undefined}
          />
        );
      })}
    </div>
  );
}

function tieStatusLabel(tie: TieSummary, live: boolean, tz: string) {
  if (live) return <StatusPill status="LIVE" />;
  if (tie.status === "FINISHED") return <span className="eyebrow text-foreground">Final{tie.winner === "DRAW" ? " · Draw" : ""}</span>;
  if (tie.status === "DECIDED") return <span className="eyebrow text-lime-accent">Decided</span>;
  return <span className="eyebrow tnum">{fmtTime(tie.scheduledAt ?? tie.matches[0]?.scheduledAt, tz)}</span>;
}

/** One category match as a full-width row (used on featured tie cards and the tie page). */
export function MatchRow({ m, detailed }: { m: MatchSummary; tie: TieSummary; detailed?: boolean }) {
  const { lk, base, b } = useT();
  const cat = lk.categories.get(m.categoryId);
  const live = isLive(m);
  const done = isDone(m);
  const names = (s: "A" | "B") => {
    const ids = s === "A" ? m.lineupA : m.lineupB;
    if (!ids?.length) return <span className="text-muted-foreground">Lineup TBD</span>;
    return ids.map((id) => {
      const serving = live && m.live?.serverId === id && m.live.servingTeam === s;
      const n = lk.players.get(id)?.name ?? "?";
      return (
        <span key={id} className={cn("block truncate", serving && "font-semibold text-lime-accent")}>
          {serving && <span className="mr-1 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-lime" aria-label="serving" />}
          {detailed ? n : n.split(" ")[0]}
        </span>
      );
    });
  };
  const centre = live && m.live ? (
    <div className="flex flex-col items-center">
      <div className="score-display flex items-baseline gap-1.5 text-3xl sm:text-4xl">
        <AnimatedNumber value={m.live.score.a} />
        <span className="text-lg text-muted-foreground/60">-</span>
        <AnimatedNumber value={m.live.score.b} />
      </div>
      <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-live">Game {m.games.length}</span>
    </div>
  ) : done ? (
    <div className="flex flex-wrap justify-center gap-1">
      {m.games.filter((g) => g.winner).map((g, i) => (
        <span key={i} className="rounded-md bg-muted px-1.5 py-0.5 font-display text-sm font-bold tnum">{g.a}-{g.b}</span>
      ))}
      {m.status !== "FINISHED" && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-bold uppercase">{m.status === "WALKOVER" ? "W/O" : "Ret."}</span>}
    </div>
  ) : m.status === "NOT_REQUIRED" ? (
    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Not required</span>
  ) : (
    <span className="font-display text-lg font-bold text-muted-foreground tnum">{m.isDecider ? "Decider" : fmtTime(m.scheduledAt, b.tournament.timezone)}</span>
  );
  return (
    <Link
      to={`${base}/match/${m.id}`}
      className={cn(
        "group grid min-h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-xl border bg-background/40 px-3 py-2.5 transition-colors duration-200 hover:border-foreground/25 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        live && "border-live/45 bg-live/[0.06]",
        m.status === "NOT_REQUIRED" && "opacity-45",
      )}
    >
      <div className="col-span-3 flex items-center gap-2 text-xs">
        <span className="font-display text-sm font-bold text-muted-foreground tnum">{m.slotOrder}</span>
        <CategoryBadge category={cat} />
        <span className="truncate font-medium text-muted-foreground">{cat?.name}</span>
        {m.weight > 1 && <span className="rounded bg-muted px-1 font-bold">×{m.weight}</span>}
        <span className="ml-auto flex items-center gap-2">
          {m.court && <span className="hidden text-muted-foreground sm:inline">{m.court}</span>}
          {live ? <StatusPill status={m.status} /> : null}
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
      <div className={cn("min-w-0 text-sm leading-snug", m.winner === "B" && "opacity-55", m.winner === "A" && "font-semibold")}>{names("A")}</div>
      <div className="flex min-w-20 justify-center">{centre}</div>
      <div className={cn("min-w-0 text-right text-sm leading-snug", m.winner === "A" && "opacity-55", m.winner === "B" && "font-semibold")}>{names("B")}</div>
    </Link>
  );
}

export function TieCard({ tie, big }: { tie: TieSummary; big?: boolean }) {
  const { base, b, lk } = useT();
  const live = tie.matches.some(isLive);
  const a = lk.teams.get(tie.teamAId ?? "");
  const bt = lk.teams.get(tie.teamBId ?? "");
  return (
    <motion.article layout className={cn("surface relative min-w-0 overflow-hidden", live && "surface-live")}>
      <div className="pointer-events-none absolute inset-0" style={teamWash(a, bt, big ? 0.28 : 0.16)} aria-hidden />
      <div className="relative p-3 sm:p-5">
        <Link to={`${base}/tie/${tie.id}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="eyebrow truncate">{tie.roundLabel ?? `Round ${tie.round}`}</span>
            {tieStatusLabel(tie, live, b.tournament.timezone)}
          </div>
          <TieScoreLine tie={tie} big={big} />
          <div className="mt-4"><TieProgress tie={tie} /></div>
        </Link>
        {big ? (
          <div className="mt-4 grid gap-2">{tie.matches.map((m) => <MatchRow key={m.id} m={m} tie={tie} />)}</div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
            {tie.matches.map((m) => <MatchChip key={m.id} m={m} tie={tie} />)}
          </div>
        )}
      </div>
    </motion.article>
  );
}

/** Live match card styled like a broadcast score bug. */
export function LiveMatchCard({ m }: { m: MatchSummary }) {
  const { lk, base } = useT();
  const tie = lk.ties.get(m.tieId)!;
  const cat = lk.categories.get(m.categoryId);
  const row = (side: "A" | "B") => {
    const team = lk.teams.get((side === "A" ? tie.teamAId : tie.teamBId) ?? "");
    const ids = side === "A" ? m.lineupA : m.lineupB;
    const serving = m.live?.servingTeam === side && m.status === "LIVE";
    const score = m.live ? (side === "A" ? m.live.score.a : m.live.score.b) : 0;
    return (
      <div className="flex items-stretch gap-0 overflow-hidden rounded-lg bg-background/60">
        <span className="w-1.5 shrink-0" style={{ background: team?.color ?? "#52525b" }} aria-hidden />
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2">
          <span className="w-10 shrink-0 font-display text-sm font-bold uppercase tracking-wider">{team?.code ?? "TBD"}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {ids?.map((id) => (
              <span key={id} className={cn("mr-1.5", m.live?.serverId === id && serving && "font-semibold text-lime-accent")}>{lk.players.get(id)?.name.split(" ")[0]}</span>
            )) ?? "TBD"}
          </span>
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", serving ? "bg-lime shadow-glow" : "bg-transparent")} aria-label={serving ? "serving" : undefined} />
          <span className="flex gap-1 tnum">
            {m.games.slice(0, -1).map((g, i) => {
              const won = side === "A" ? g.a > g.b : g.b > g.a;
              return <span key={i} className={cn("grid h-6 min-w-6 place-items-center rounded font-display text-sm font-bold", won ? "bg-foreground/10 text-foreground" : "text-muted-foreground")}>{side === "A" ? g.a : g.b}</span>;
            })}
          </span>
        </div>
        <span className={cn("score-display grid w-14 shrink-0 place-items-center text-3xl", serving ? "bg-lime text-black" : "bg-foreground/[0.06]")}>
          <AnimatedNumber value={score} />
        </span>
      </div>
    );
  };
  const flag = m.live?.matchPoint.length ? "Match point" : m.live?.gamePoint.length ? "Game point" : m.live?.switchEndsAlert ? "Switch ends" : null;
  return (
    <Link to={`${base}/match/${m.id}`} className="surface surface-live hover-lift block p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="mb-2.5 flex items-center gap-2 text-xs">
        <LiveDot />
        <span className="font-bold uppercase tracking-[0.14em] text-live">{m.status === "PAUSED" ? "Paused" : "Live"}</span>
        <CategoryBadge category={cat} />
        <span className="ml-auto font-medium text-muted-foreground">{m.court ?? ""}{m.court ? " · " : ""}Game {m.games.length}</span>
      </div>
      <div className="space-y-1.5">{row("A")}{row("B")}</div>
      <div className="mt-2.5 flex min-h-6 items-center gap-2 text-xs">
        {m.live && <span className="rounded-md border px-1.5 py-0.5 font-display text-sm font-bold tnum">{m.live.call}</span>}
        {flag && <span className={cn("rounded-md px-1.5 py-0.5 font-bold uppercase tracking-wider", flag === "Switch ends" ? "bg-secondary" : "bg-lime text-black")}>{flag}</span>}
      </div>
    </Link>
  );
}
