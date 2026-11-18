import { Crown, Medal } from "lucide-react";
import { useT } from "@/components/public/context";
import { CategoryBadge, EmptyState, TeamChip } from "@/components/match/bits";
import { cn } from "@/lib/utils";
import type { CategoryBoard } from "@shared/api";
import { Avatar } from "./TeamsPage";
import { PageTitle } from "./PublicRoutes";

type Pair = CategoryBoard["pairs"][number];
const PLACE = ["1st", "2nd", "3rd"];

function Podium({ pairs }: { pairs: Pair[] }) {
  const { lk } = useT();
  const top = pairs.slice(0, 3);
  // DOM in rank order for screen readers; CSS order shows 2 · 1 · 3. Rank is also stated in text, not by height alone.
  return (
    <ol className="grid grid-cols-3 items-end gap-2" aria-label="Top three">
      {top.map((p, i) => {
        const team = lk.teams.get(p.teamId);
        const names = p.playerIds.map((id) => lk.players.get(id));
        return (
          <li key={p.playerIds.join()} className="flex min-w-0 flex-col items-center text-center" style={{ order: i === 0 ? 2 : i === 1 ? 1 : 3 }}>
            <div className="mb-2 flex -space-x-3">
              {names.map((pl, k) => pl && <Avatar key={k} name={pl.name} url={pl.photoUrl} color={team?.color} />)}
            </div>
            <div className="w-full min-w-0 truncate text-xs font-semibold sm:text-sm">{names.map((n) => n?.name.split(" ")[0]).join(" & ")}</div>
            <div className="mb-2 text-[11px] text-muted-foreground tnum">{p.won}-{p.lost} · {p.pointsFor - p.pointsAgainst > 0 ? "+" : ""}{p.pointsFor - p.pointsAgainst}</div>
            <div className={cn("flex w-full flex-col items-center justify-start rounded-t-xl border border-b-0 pt-2", i === 0 ? "h-24 border-lime/40 bg-gradient-to-b from-lime/20 to-lime/[0.03]" : i === 1 ? "h-16 bg-gradient-to-b from-foreground/10 to-transparent" : "h-12 bg-gradient-to-b from-amber-700/20 to-transparent")}>
              {i === 0 && <Crown className="h-4 w-4 text-lime-accent" aria-hidden />}
              <span className={cn("font-display text-xl font-extrabold", i === 0 && "text-lime-accent")}>{PLACE[i]}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function LeadersPage() {
  const { b, lk } = useT();
  const boards = b.categoryBoards.filter((x) => lk.categories.has(x.categoryId)).sort((x, y) => lk.categories.get(x.categoryId)!.sortOrder - lk.categories.get(y.categoryId)!.sortOrder);
  if (!boards.length) return (<><PageTitle eyebrow="By category" title="Leaders" /><EmptyState icon={<Medal className="h-7 w-7" />} title="No results yet">Category leaderboards appear after the first finished matches.</EmptyState></>);
  return (
    <div>
      <PageTitle eyebrow="By category" title="Leaders" />
      <div className="grid gap-4 lg:grid-cols-2">
        {boards.map((bd) => {
          const c = lk.categories.get(bd.categoryId)!;
          return (
            <section key={bd.categoryId} className="surface relative overflow-hidden p-4 sm:p-5" aria-labelledby={`lb-${c.id}`}>
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24" style={{ background: `linear-gradient(180deg, ${c.color}1f, transparent)` }} />
              <h2 id={`lb-${c.id}`} className="relative mb-4 flex items-center gap-2 font-display text-2xl font-bold uppercase tracking-wide"><CategoryBadge category={c} /> {c.name}</h2>
              {bd.pairs.length > 0 && <div className="relative mb-4"><p className="eyebrow mb-2">Best {c.format === "SINGLES" ? "players" : "pairs"}</p><Podium pairs={bd.pairs} /></div>}
              <p className="eyebrow mb-1.5">Teams</p>
              <table className="w-full text-sm tnum">
                <thead className="sr-only"><tr><th>Rank</th><th>Team</th><th>Won-lost</th><th>Point difference</th></tr></thead>
                <tbody>
                  {bd.teams.map((t, i) => {
                    const pd = t.pointsFor - t.pointsAgainst;
                    return (
                      <tr key={t.teamId} className="border-t border-border/60">
                        <td className="w-8 py-2 font-display text-base font-bold text-muted-foreground">{i + 1}</td>
                        <td className="py-2"><span className="flex items-center gap-2"><TeamChip team={lk.teams.get(t.teamId)} size="sm" /><span className="truncate">{lk.teams.get(t.teamId)?.name}</span></span></td>
                        <td className="py-2 text-right font-semibold">{t.won}-{t.lost}</td>
                        <td className={cn("w-14 py-2 text-right text-muted-foreground", pd > 0 && "text-lime-accent")}>{pd > 0 ? `+${pd}` : pd}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </div>
  );
}
