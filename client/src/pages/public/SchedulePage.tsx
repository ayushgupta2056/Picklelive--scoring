import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { useT } from "@/components/public/context";
import { lineupNames } from "@/components/public/MatchBits";
import { CategoryBadge, EmptyState, StatusPill, TeamChip } from "@/components/match/bits";
import { NativeSelect } from "@/components/ui/input";
import { dayKey, fmtDay, fmtTime } from "@/lib/format";
import { Button } from "@/components/ui/button";

export default function SchedulePage() {
  const { b, lk, base } = useT();
  const tz = b.tournament.timezone;
  const [f, setF] = useState({ day: "", court: "", category: "", team: "", stage: "" });
  const rows = useMemo(() => {
    const all = b.ties.flatMap((t) => t.matches.map((m) => ({ m, t })));
    return all
      .filter(({ m, t }) =>
        (!f.day || dayKey(m.scheduledAt, tz) === f.day) &&
        (!f.court || m.court === f.court) &&
        (!f.category || m.categoryId === f.category) &&
        (!f.team || t.teamAId === f.team || t.teamBId === f.team) &&
        (!f.stage || t.stageId === f.stage))
      .sort((x, y) => (x.m.scheduledAt ?? "9").localeCompare(y.m.scheduledAt ?? "9") || (x.m.court ?? "").localeCompare(y.m.court ?? ""));
  }, [b.ties, f, tz]);
  const days = [...new Set(b.ties.flatMap((t) => t.matches.map((m) => dayKey(m.scheduledAt, tz))))].sort();
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = dayKey(r.m.scheduledAt, tz);
    grouped.set(k, [...(grouped.get(k) ?? []), r]);
  }
  const sel = (k: keyof typeof f, label: string, opts: [string, string][]) => (
    <NativeSelect aria-label={label} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="h-11">
      <option value="">All {label.toLowerCase()}</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </NativeSelect>
  );
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black">Schedule</h1>
        <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>Print</Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Times shown in {tz}.</p>
      <div className="no-print mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        {sel("day", "Days", days.map((d) => [d, d === "unscheduled" ? "Unscheduled" : fmtDay(`${d}T12:00:00Z`, "UTC")]))}
        {sel("court", "Courts", b.tournament.courtNames.map((c) => [c, c]))}
        {sel("category", "Categories", b.categories.map((c) => [c.id, c.name]))}
        {sel("team", "Teams", b.teams.map((t) => [t.id, t.name]))}
        {sel("stage", "Stages", b.stages.map((s) => [s.id, s.name]))}
      </div>
      {rows.length === 0 && <EmptyState icon={<CalendarDays className="h-8 w-8" />} title="No matches match these filters" />}
      {[...grouped.entries()].map(([day, list]) => (
        <section key={day} className="mb-6">
          <h2 className="sticky top-14 z-10 mb-2 bg-background/95 py-2 text-sm font-black uppercase tracking-wide text-muted-foreground md:top-[6.25rem]">{day === "unscheduled" ? "Unscheduled" : fmtDay(list[0].m.scheduledAt, tz)}</h2>
          <ul className="divide-y rounded-xl border">
            {list.map(({ m, t }) => (
              <li key={m.id}>
                <Link to={`${base}/match/${m.id}`} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 p-3 hover:bg-accent/50 sm:grid-cols-[4rem_6rem_1fr_auto]">
                  <span className="font-bold tnum">{fmtTime(m.scheduledAt, tz)}</span>
                  <span className="hidden text-sm text-muted-foreground sm:block">{m.court ?? "—"}</span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <CategoryBadge category={lk.categories.get(m.categoryId)} />
                      <TeamChip team={lk.teams.get(t.teamAId ?? "")} size="sm" />
                      <span className="text-xs text-muted-foreground">vs</span>
                      <TeamChip team={lk.teams.get(t.teamBId ?? "")} size="sm" />
                      <span className="text-xs text-muted-foreground sm:hidden">{m.court}</span>
                    </span>
                    {(m.lineupA || m.lineupB) && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{lineupNames(m.lineupA, lk.players, true)} v {lineupNames(m.lineupB, lk.players, true)}</span>}
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <StatusPill status={m.status} />
                    {m.games.some((g) => g.winner) && <span className="text-xs font-bold tnum">{m.games.filter((g) => g.winner).map((g) => `${g.a}-${g.b}`).join(" ")}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
