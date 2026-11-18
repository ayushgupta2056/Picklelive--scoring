import { Link, useParams } from "react-router-dom";
import { useT } from "@/components/public/context";
import { lineupNames, TieScoreLine } from "@/components/public/MatchBits";
import { CategoryBadge, EmptyState, StatusPill, TeamChip } from "@/components/match/bits";
import { ShareButton } from "@/components/public/Share";
import { useRooms } from "@/lib/socket";
import { fmtDay, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function TiePage() {
  const { tieId = "" } = useParams();
  const { b, lk, base } = useT();
  useRooms([`tie:${tieId}`]);
  const tie = lk.ties.get(tieId);
  if (!tie) return <EmptyState title="Tie not found" />;
  const tz = b.tournament.timezone;
  const a = lk.teams.get(tie.teamAId ?? "");
  const bt = lk.teams.get(tie.teamBId ?? "");
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted-foreground">{tie.roundLabel} · {fmtDay(tie.matches[0]?.scheduledAt, tz)}</p>
        <ShareButton path={`${base}/tie/${tie.id}`} title={`${a?.name ?? "TBD"} vs ${bt?.name ?? "TBD"}`} />
      </div>
      <div className="rounded-2xl border bg-card p-4 sm:p-6">
        <TieScoreLine tie={tie} big />
        <p className="mt-3 text-center text-sm font-bold uppercase tracking-wide text-muted-foreground">
          {tie.status === "FINISHED" ? (tie.winner === "DRAW" ? "Tie drawn" : `${lk.teams.get((tie.winner === "A" ? tie.teamAId : tie.teamBId) ?? "")?.name} win the tie`) : tie.status === "DECIDED" ? "Tie decided · dead rubbers in play" : tie.status === "IN_PROGRESS" ? "In progress" : "Upcoming"}
        </p>
      </div>
      <ul className="space-y-2">
        {tie.matches.map((m) => {
          const c = lk.categories.get(m.categoryId);
          const live = m.status === "LIVE";
          return (
            <li key={m.id}>
              <Link to={`${base}/match/${m.id}`} className={cn("grid gap-2 rounded-xl border p-3 hover:bg-accent/40 sm:grid-cols-[10rem_1fr_auto] sm:items-center", live && "border-live/50", m.status === "NOT_REQUIRED" && "opacity-50")}>
                <span className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground tnum">#{m.slotOrder}</span>
                  <CategoryBadge category={c} />
                  <span className="truncate text-sm font-semibold">{c?.name}</span>
                </span>
                <span className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-sm">
                  <TeamChip team={a} size="sm" /><span className={cn("truncate", m.winner === "A" && "font-bold")}>{lineupNames(m.lineupA, lk.players)}</span>
                  <TeamChip team={bt} size="sm" /><span className={cn("truncate", m.winner === "B" && "font-bold")}>{lineupNames(m.lineupB, lk.players)}</span>
                </span>
                <span className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <StatusPill status={m.status} />
                  <span className="text-sm font-bold tnum">
                    {m.games.map((g, i) => <span key={i} className="ml-2">{g.a}-{g.b}</span>)}
                    {!m.games.length && <span className="text-muted-foreground">{m.court ?? ""} {fmtTime(m.scheduledAt, tz)}{m.weight > 1 ? ` · ×${m.weight}` : ""}{m.isDecider ? " · decider" : ""}</span>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
