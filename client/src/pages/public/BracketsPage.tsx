import { Link } from "react-router-dom";
import { GitBranch } from "lucide-react";
import { useT } from "@/components/public/context";
import { EmptyState, LiveDot, TeamChip } from "@/components/match/bits";
import { cn } from "@/lib/utils";
import type { TieSummary } from "@shared/api";

function BracketTie({ t }: { t: TieSummary }) {
  const { lk, base } = useT();
  const live = t.matches.some((m) => m.status === "LIVE");
  const row = (side: "A" | "B") => {
    const team = lk.teams.get((side === "A" ? t.teamAId : t.teamBId) ?? "");
    const win = t.winner === side;
    return (
      <div className={cn("flex items-center gap-2 px-2 py-1.5", t.winner && !win && "opacity-50")}>
        <TeamChip team={team} size="sm" />
        <span className={cn("min-w-0 flex-1 truncate text-sm", win && "font-bold")}>{team?.name ?? "TBD"}</span>
        <span className={cn("font-black tnum", win && "text-lime-accent")}>{t.status === "SCHEDULED" ? "" : side === "A" ? t.scoreA : t.scoreB}</span>
      </div>
    );
  };
  return (
    <Link to={`${base}/tie/${t.id}`} className={cn("block w-56 divide-y rounded-xl border bg-card hover:border-lime", live && "border-live/60")}>
      <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{live && <LiveDot className="h-2 w-2" />}{t.roundLabel}</div>
      {row("A")}
      {row("B")}
    </Link>
  );
}

export default function BracketsPage() {
  const { b } = useT();
  const ko = b.stages.filter((s) => s.type === "KNOCKOUT");
  if (!ko.length) return <EmptyState icon={<GitBranch className="h-8 w-8" />} title="No knockout stage yet" />;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-black">Brackets</h1>
      {ko.map((s) => {
        const ties = b.ties.filter((t) => t.stageId === s.id);
        const third = ties.filter((t) => t.roundLabel === "3rd place");
        const main = ties.filter((t) => t.roundLabel !== "3rd place");
        const rounds = [...new Set(main.map((t) => t.round))].sort((a, c) => a - c);
        return (
          <section key={s.id}>
            <h2 className="mb-3 text-lg font-bold">{s.name}</h2>
            {!ties.length ? (
              <EmptyState icon={<GitBranch className="h-8 w-8" />} title="Bracket not drawn yet">It fills in once the group stage finishes and the admin seeds the knockout.</EmptyState>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4 pb-4">
                <div className="flex min-w-max gap-8">
                  {rounds.map((r) => (
                    <div key={r} className="flex flex-col justify-around gap-4">
                      <h3 className="text-xs font-black uppercase tracking-wide text-muted-foreground">{main.find((t) => t.round === r)?.roundLabel}</h3>
                      {main.filter((t) => t.round === r).sort((x, y) => (x.bracketPos ?? 0) - (y.bracketPos ?? 0)).map((t) => <BracketTie key={t.id} t={t} />)}
                    </div>
                  ))}
                  {third.length > 0 && (
                    <div className="flex flex-col justify-end gap-4">
                      <h3 className="text-xs font-black uppercase tracking-wide text-muted-foreground">3rd place</h3>
                      {third.map((t) => <BracketTie key={t.id} t={t} />)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
