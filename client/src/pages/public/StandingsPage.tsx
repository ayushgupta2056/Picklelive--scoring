import { Link } from "react-router-dom";
import { ListOrdered } from "lucide-react";
import { useT } from "@/components/public/context";
import { EmptyState, TeamChip } from "@/components/match/bits";
import { cn } from "@/lib/utils";

export function StandingsTable({ groupId, compact }: { groupId: string; compact?: boolean }) {
  const { b, lk, base } = useT();
  const g = b.standings.find((s) => s.groupId === groupId);
  if (!g) return null;
  type Row = NonNullable<typeof g>["rows"][number];
  const cols: [string, string, (r: Row) => React.ReactNode, boolean?][] = [
    ["P", "Ties played", (r) => r.played],
    ["W", "Won", (r) => r.won],
    ["D", "Drawn", (r) => r.drawn, true],
    ["L", "Lost", (r) => r.lost],
    ["M", "Matches W-L", (r) => `${r.matchesWon}-${r.matchesLost}`],
    ["G", "Games W-L", (r) => `${r.gamesWon}-${r.gamesLost}`, true],
    ["PF", "Points for", (r) => r.pointsFor, true],
    ["PA", "Points against", (r) => r.pointsAgainst, true],
    ["PD", "Point difference", (r) => (r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff)],
    ["Pts", "Tie points", (r) => <b className="text-foreground">{r.tiePoints}</b>],
  ];
  const shown = compact ? cols.filter((c) => !c[3]) : cols;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm tnum">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="w-8 p-2 text-left">#</th>
            <th className="p-2 text-left">Team</th>
            {shown.map(([k, title, , hide]) => <th key={k} title={title} className={cn("p-2 text-right", hide && "hidden md:table-cell")}><abbr title={title} className="no-underline">{k}</abbr></th>)}
          </tr>
        </thead>
        <tbody>
          {g.rows.map((r) => {
            const team = lk.teams.get(r.teamId);
            const q = r.rank <= g.qualifiers;
            return (
              <tr key={r.teamId} className={cn("border-t", q && "bg-lime/[0.06]")}>
                <td className={cn("p-2 font-bold", q && "border-l-4 border-lime")}>{r.rank}</td>
                <td className="p-2"><Link to={`${base}/teams/${r.teamId}`} className="flex items-center gap-2 font-semibold hover:underline"><TeamChip team={team} size="sm" /><span className="truncate">{team?.name}</span></Link></td>
                {shown.map(([k, , f, hide]) => <td key={k} className={cn("p-2 text-right text-muted-foreground", hide && "hidden md:table-cell")}>{f(r)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StandingsPage() {
  const { b } = useT();
  const rr = b.stages.filter((s) => s.type === "ROUND_ROBIN");
  if (!rr.length) return <EmptyState icon={<ListOrdered className="h-8 w-8" />} title="No group stage yet" />;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-black">Standings</h1>
      {rr.map((s) => (
        <section key={s.id} className="space-y-4">
          <h2 className="text-lg font-bold">{s.name}</h2>
          {s.groups.map((g) => (
            <div key={g.id}>
              <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-muted-foreground">{g.name}</h3>
              <StandingsTable groupId={g.id} />
            </div>
          ))}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        Highlighted rows qualify. Tie points: win {b.tournament.settings.pointsWin}, draw {b.tournament.settings.pointsDraw}, loss {b.tournament.settings.pointsLoss}. Tiebreak order:{" "}
        {b.tournament.settings.tiebreakOrder.map((t) => t.replace(/_/g, " ").toLowerCase()).join(" → ")}.
      </p>
    </div>
  );
}
