import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Printer, SlidersHorizontal, X } from "lucide-react";
import { useT } from "@/components/public/context";
import { lineupNames } from "@/components/public/MatchBits";
import { CategoryBadge, EmptyState, StatusPill, TeamChip } from "@/components/match/bits";
import { NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { dayKey, fmtDay, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MatchSummary, TieSummary } from "@shared/api";
import { PageTitle } from "./PublicRoutes";

type Row = { m: MatchSummary; t: TieSummary };
const EMPTY = { day: "", court: "", category: "", team: "", stage: "" };

export default function SchedulePage() {
  const { b, lk, base } = useT();
  const tz = b.tournament.timezone;
  const [f, setF] = useState(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const rows = useMemo(() => {
    const all: Row[] = b.ties.flatMap((t) => t.matches.map((m) => ({ m, t })));
    return all
      .filter(({ m, t }) =>
        (!f.day || dayKey(m.scheduledAt, tz) === f.day) &&
        (!f.court || m.court === f.court) &&
        (!f.category || m.categoryId === f.category) &&
        (!f.team || t.teamAId === f.team || t.teamBId === f.team) &&
        (!f.stage || t.stageId === f.stage))
      .sort((x, y) => (x.m.scheduledAt ?? "9").localeCompare(y.m.scheduledAt ?? "9") || (x.m.court ?? "").localeCompare(y.m.court ?? "", undefined, { numeric: true }));
  }, [b.ties, f, tz]);
  const days = [...new Set(b.ties.flatMap((t) => t.matches.map((m) => dayKey(m.scheduledAt, tz))))].sort();

  // day → time → rows
  const grouped = useMemo(() => {
    const out = new Map<string, Map<string, Row[]>>();
    for (const r of rows) {
      const d = dayKey(r.m.scheduledAt, tz);
      const time = r.m.scheduledAt ? fmtTime(r.m.scheduledAt, tz) : "TBD";
      const day = out.get(d) ?? new Map<string, Row[]>();
      out.set(d, day);
      day.set(time, [...(day.get(time) ?? []), r]);
    }
    return out;
  }, [rows, tz]);

  const active = Object.values(f).filter(Boolean).length;
  const sel = (k: keyof typeof f, label: string, opts: [string, string][]) => (
    <NativeSelect aria-label={label} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={cn("h-11", f[k] && "border-lime/50 text-foreground")}>
      <option value="">All {label.toLowerCase()}</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </NativeSelect>
  );

  return (
    <div>
      <PageTitle eyebrow={`Times in ${tz}`} title="Schedule">
        <Button variant="outline" size="sm" className="md:hidden" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="schedule-filters">
          <SlidersHorizontal /> Filters{active > 0 && <span className="rounded-full bg-lime px-1.5 text-[11px] font-bold text-black tnum">{active}</span>}
        </Button>
        {active > 0 && <Button variant="ghost" size="sm" onClick={() => setF(EMPTY)}><X /> Clear</Button>}
        <Button variant="outline" size="sm" className="no-print hidden sm:inline-flex" onClick={() => window.print()}><Printer /> Print</Button>
      </PageTitle>

      {days.length > 1 && (
        <div className="no-print -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Day">
          {[["", "All days"] as [string, string], ...days.map((d) => [d, d === "unscheduled" ? "Unscheduled" : fmtDay(`${d}T12:00:00Z`, "UTC")] as [string, string])].map(([v, l]) => (
            <button key={v || "all"} onClick={() => setF({ ...f, day: v })} aria-pressed={f.day === v}
              className={cn("h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", f.day === v ? "border-lime bg-lime text-black" : "hover:bg-accent")}>
              {l}
            </button>
          ))}
        </div>
      )}

      <div id="schedule-filters" className={cn("no-print mb-6 grid grid-cols-2 gap-2 md:grid md:grid-cols-4", !showFilters && "hidden")}>
        {sel("court", "Courts", b.tournament.courtNames.map((c) => [c, c]))}
        {sel("category", "Categories", b.categories.map((c) => [c.id, c.name]))}
        {sel("team", "Teams", b.teams.map((t) => [t.id, t.name]))}
        {sel("stage", "Stages", b.stages.map((s) => [s.id, s.name]))}
      </div>

      {rows.length === 0 && <EmptyState icon={<CalendarDays className="h-7 w-7" />} title="No matches found">Try clearing a filter.</EmptyState>}

      {[...grouped.entries()].map(([day, times]) => (
        <section key={day} className="mb-8" aria-label={day === "unscheduled" ? "Unscheduled" : fmtDay(`${day}T12:00:00Z`, "UTC")}>
          <h2 className="sticky top-16 z-10 -mx-4 mb-3 border-b border-border/60 bg-background/85 px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wide backdrop-blur md:top-[7rem]">
            {day === "unscheduled" ? "Unscheduled" : fmtDay(`${day}T12:00:00Z`, "UTC")}
            <span className="ml-2 text-sm font-semibold normal-case tracking-normal text-muted-foreground">{[...times.values()].flat().length} matches</span>
          </h2>
          <ol className="relative space-y-5 border-l border-border/70 pl-5 sm:ml-14 sm:pl-6">
            {[...times.entries()].map(([time, list]) => {
              const live = list.some((r) => r.m.status === "LIVE");
              return (
                <li key={time} className="relative">
                  <span aria-hidden className={cn("absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-background sm:-left-[31px]", live ? "bg-live shadow-live" : "bg-muted-foreground/50")} />
                  <h3 className="mb-2 font-display text-2xl font-bold leading-none tnum sm:absolute sm:-left-[5.75rem] sm:top-0 sm:w-12 sm:text-right sm:text-xl">{time}</h3>
                  <ul className="grid gap-2 lg:grid-cols-2">
                    {list.map(({ m, t }) => <MatchRow key={m.id} m={m} t={t} lk={lk} base={base} />)}
                  </ul>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function MatchRow({ m, t, lk, base }: Row & { lk: ReturnType<typeof useT>["lk"]; base: string }) {
  const A = lk.teams.get(t.teamAId ?? "");
  const B = lk.teams.get(t.teamBId ?? "");
  const live = m.status === "LIVE" || m.status === "PAUSED";
  const done = ["FINISHED", "WALKOVER", "RETIRED"].includes(m.status);
  const side = (s: "A" | "B") => {
    const team = s === "A" ? A : B;
    const ids = s === "A" ? m.lineupA : m.lineupB;
    const lost = m.winner && m.winner !== s;
    const g = m.live?.score;
    return (
      <div className={cn("flex items-center gap-2", lost && "opacity-55")}>
        <TeamChip team={team} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold">{team?.name ?? "TBD"}</span>
          {ids && <span className="ml-1.5 text-muted-foreground">{lineupNames(ids, lk.players, true)}</span>}
        </span>
        {done && <span className={cn("font-display text-lg font-bold tnum", m.winner === s && "text-lime-accent")}>{s === "A" ? m.gamesA : m.gamesB}</span>}
        {live && g && <span className="font-display text-xl font-extrabold tnum">{s === "A" ? g.a : g.b}</span>}
      </div>
    );
  };
  return (
    <li>
      <Link to={`${base}/match/${m.id}`} className={cn("surface hover-lift block p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", live && "surface-live", m.status === "NOT_REQUIRED" && "opacity-50")}>
        <div className="mb-2 flex items-center gap-2 text-xs">
          <CategoryBadge category={lk.categories.get(m.categoryId)} />
          <span className="font-semibold text-muted-foreground">{m.court ?? "Court TBD"}</span>
          {m.isDecider && <span className="font-semibold text-amber-500">Decider</span>}
          <span className="ml-auto"><StatusPill status={m.status} /></span>
        </div>
        <div className="space-y-1">{side("A")}{side("B")}</div>
        {done && m.games.some((g) => g.winner) && (
          <div className="mt-2 flex gap-1.5 text-xs text-muted-foreground tnum">{m.games.filter((g) => g.winner).map((g, i) => <span key={i} className="rounded bg-muted px-1.5 py-0.5">{g.a}-{g.b}</span>)}</div>
        )}
      </Link>
    </li>
  );
}
