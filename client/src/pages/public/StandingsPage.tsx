import { Link } from "react-router-dom";
import { ListOrdered } from "lucide-react";
import { useT } from "@/components/public/context";
import { EmptyState, TeamChip } from "@/components/match/bits";
import { cn } from "@/lib/utils";
import type { TieSummary } from "@shared/api";
import { PageTitle } from "./PublicRoutes";

type Result = "W" | "D" | "L";

/** Last N finished tie results for a team within a group, oldest first. */
function formOf(teamId: string, ties: TieSummary[], n = 5): Result[] {
  return ties
    .filter((t) => t.status === "FINISHED" && (t.teamAId === teamId || t.teamBId === teamId))
    .sort((a, b) => (a.scheduledAt ?? a.matches[0]?.scheduledAt ?? "").localeCompare(b.scheduledAt ?? b.matches[0]?.scheduledAt ?? ""))
    .slice(-n)
    .map((t) => (t.winner === "DRAW" ? "D" : (t.winner === "A") === (t.teamAId === teamId) ? "W" : "L"));
}

const hideCls = (h?: boolean | "sm") => (h === "sm" ? "hidden sm:table-cell" : h ? "hidden md:table-cell" : "");

const FORM_STYLE: Record<Result, string> = {
  W: "bg-lime text-black",
  D: "bg-muted-foreground/40 text-foreground",
  L: "bg-live/80 text-white",
};

export function StandingsTable({ groupId, compact }: { groupId: string; compact?: boolean }) {
  const { b, lk, base } = useT();
  const g = b.standings.find((s) => s.groupId === groupId);
  if (!g) return null;
  type Row = NonNullable<typeof g>["rows"][number];
  const groupTies = b.ties.filter((t) => t.groupId === groupId);
  const cols: [string, string, (r: Row) => React.ReactNode, (boolean | "sm")?][] = [
    ["P", "Ties played", (r) => r.played],
    ["W", "Won", (r) => r.won],
    ["D", "Drawn", (r) => r.drawn, true],
    ["L", "Lost", (r) => r.lost],
    ["M", "Matches won-lost", (r) => `${r.matchesWon}-${r.matchesLost}`, "sm"],
    ["G", "Games won-lost", (r) => `${r.gamesWon}-${r.gamesLost}`, true],
    ["PF", "Points for", (r) => r.pointsFor, true],
    ["PA", "Points against", (r) => r.pointsAgainst, true],
    ["PD", "Point difference", (r) => <span className={cn(r.pointDiff > 0 && "text-lime-accent", r.pointDiff < 0 && "text-live")}>{r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}</span>],
  ];
  const shown = compact ? cols.filter((c) => c[3] !== true) : cols;
  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm tnum">
          <caption className="sr-only">Standings, top {g.qualifiers} qualify</caption>
          <thead className="border-b text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-2 py-3 text-left font-semibold sm:w-12 sm:px-3">#</th>
              <th scope="col" className="px-2 py-3 text-left font-semibold">Team</th>
              {shown.map(([k, title, , hide]) => <th key={k} scope="col" title={title} className={cn("px-2 py-3 text-right font-semibold", hideCls(hide))}><abbr title={title} className="no-underline">{k}</abbr></th>)}
              <th scope="col" className="hidden px-3 py-3 text-left font-semibold lg:table-cell">Form</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold"><abbr title="Tie points" className="no-underline">Pts</abbr></th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r, i) => {
              const team = lk.teams.get(r.teamId);
              const q = r.rank <= g.qualifiers;
              const cutoff = i === g.qualifiers - 1 && i < g.rows.length - 1;
              const form = formOf(r.teamId, groupTies);
              return (
                <tr key={r.teamId} data-testid={`standing-${team?.code}`} data-points={r.tiePoints}
                  className={cn("relative transition-colors hover:bg-accent/40", i > 0 && "border-t border-border/60", cutoff && "border-b-2 border-b-lime/50")}>
                  <td className="px-2 py-3 sm:px-3">
                    <span className={cn("relative grid h-8 w-8 place-items-center rounded-lg font-display text-base font-bold", q ? "bg-lime/15 text-lime-accent ring-1 ring-lime/40" : "bg-muted text-muted-foreground")}>
                      {q && <span aria-hidden className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-lime" />}
                      {r.rank}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <Link to={`${base}/teams/${r.teamId}`} className="flex min-h-11 items-center gap-2.5 rounded-md font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <TeamChip team={team} size="sm" />
                      <span className="max-w-[9rem] truncate sm:max-w-none">{team?.name}</span>
                      {q && <span className="sr-only">(qualifying)</span>}
                    </Link>
                  </td>
                  {shown.map(([k, , f, hide]) => <td key={k} className={cn("whitespace-nowrap px-2 py-3 text-right text-muted-foreground", hideCls(hide))}>{f(r)}</td>)}
                  <td className="hidden px-3 py-3 lg:table-cell">
                    <span className="flex gap-1" aria-label={form.length ? `Form: ${form.join(" ")}` : "No results yet"}>
                      {form.length ? form.map((x, j) => <span key={j} className={cn("grid h-6 w-6 place-items-center rounded font-display text-xs font-bold", FORM_STYLE[x])} aria-hidden>{x}</span>) : <span className="text-xs text-muted-foreground">—</span>}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right"><span className="font-display text-2xl font-extrabold leading-none text-foreground">{r.tiePoints}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function StandingsPage() {
  const { b } = useT();
  const rr = b.stages.filter((s) => s.type === "ROUND_ROBIN");
  if (!rr.length) return <EmptyState icon={<ListOrdered className="h-7 w-7" />} title="No group stage yet" />;
  const s = b.tournament.settings;
  return (
    <div className="space-y-10">
      <PageTitle eyebrow="Team table" title="Standings" />
      {rr.map((st) => (
        <section key={st.id} className="space-y-6" aria-labelledby={`st-${st.id}`}>
          {rr.length > 1 && <h2 id={`st-${st.id}`} className="font-display text-2xl font-bold uppercase tracking-wide">{st.name}</h2>}
          <div className="grid gap-6 2xl:grid-cols-2">
            {st.groups.map((g) => (
              <div key={g.id} className="min-w-0">
                <div className="mb-2.5 flex items-baseline justify-between gap-2">
                  <h3 id={rr.length > 1 ? undefined : `st-${st.id}`} className="font-display text-xl font-bold uppercase tracking-wide">{g.name}</h3>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2.5 w-1 rounded bg-lime" aria-hidden /> Top {b.standings.find((x) => x.groupId === g.id)?.qualifiers ?? 2} qualify</span>
                </div>
                <StandingsTable groupId={g.id} />
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
        Tie points: win {s.pointsWin}, draw {s.pointsDraw}, loss {s.pointsLoss}. Tiebreak order: {s.tiebreakOrder.map((t) => t.replace(/_/g, " ").toLowerCase()).join(" → ")}.
      </p>
    </div>
  );
}
