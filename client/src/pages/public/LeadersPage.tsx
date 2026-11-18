import { Medal } from "lucide-react";
import { useT } from "@/components/public/context";
import { CategoryBadge, EmptyState, TeamChip } from "@/components/match/bits";
import { lineupNames } from "@/components/public/MatchBits";

export default function LeadersPage() {
  const { b, lk } = useT();
  const boards = b.categoryBoards.filter((x) => lk.categories.has(x.categoryId)).sort((x, y) => (lk.categories.get(x.categoryId)!.sortOrder - lk.categories.get(y.categoryId)!.sortOrder));
  if (!boards.length) return <EmptyState icon={<Medal className="h-8 w-8" />} title="No results yet">Category leaderboards appear after the first finished matches.</EmptyState>;
  return (
    <div>
      <h1 className="mb-4 text-2xl font-black">Category leaders</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        {boards.map((bd) => {
          const c = lk.categories.get(bd.categoryId)!;
          const best = bd.pairs[0];
          return (
            <section key={bd.categoryId} className="rounded-2xl border p-4">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-bold"><CategoryBadge category={c} /> {c.name}</h2>
              {best && <p className="mb-3 text-sm text-muted-foreground">Best {c.format === "SINGLES" ? "player" : "pair"}: <b className="text-foreground">{lineupNames(best.playerIds, lk.players)}</b> ({best.won}-{best.lost})</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <table className="w-full text-sm tnum">
                  <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Team</th><th className="text-right">W-L</th><th className="text-right">PD</th></tr></thead>
                  <tbody>{bd.teams.map((t) => <tr key={t.teamId} className="border-t"><td className="py-1.5"><TeamChip team={lk.teams.get(t.teamId)} size="sm" /></td><td className="text-right">{t.won}-{t.lost}</td><td className="text-right">{t.pointsFor - t.pointsAgainst}</td></tr>)}</tbody>
                </table>
                <table className="w-full text-sm tnum">
                  <thead className="text-xs text-muted-foreground"><tr><th className="text-left">{c.format === "SINGLES" ? "Player" : "Pair"}</th><th className="text-right">W-L</th></tr></thead>
                  <tbody>{bd.pairs.slice(0, 6).map((p) => <tr key={p.playerIds.join()} className="border-t"><td className="max-w-0 truncate py-1.5">{lineupNames(p.playerIds, lk.players, true)}</td><td className="text-right">{p.won}-{p.lost}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
