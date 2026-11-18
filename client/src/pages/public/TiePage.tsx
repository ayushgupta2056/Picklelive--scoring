import { Link, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Trophy } from "lucide-react";
import { useT } from "@/components/public/context";
import { MatchRow, TieProgress, TieScoreLine, teamWash } from "@/components/public/MatchBits";
import { EmptyState, StatusPill } from "@/components/match/bits";
import { ShareButton } from "@/components/public/Share";
import { useRooms } from "@/lib/socket";
import { fmtDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function TiePage() {
  const { tieId = "" } = useParams();
  const { b, lk, base } = useT();
  const reduce = useReducedMotion();
  useRooms([`tie:${tieId}`]);
  const tie = lk.ties.get(tieId);
  if (!tie) return <EmptyState title="Tie not found" />;
  const tz = b.tournament.timezone;
  const a = lk.teams.get(tie.teamAId ?? "");
  const bt = lk.teams.get(tie.teamBId ?? "");
  const live = tie.matches.some((m) => m.status === "LIVE" || m.status === "PAUSED");
  const winner = tie.winner === "A" ? a : tie.winner === "B" ? bt : null;
  const done = tie.matches.filter((m) => ["FINISHED", "WALKOVER", "RETIRED"].includes(m.status)).length;
  const counted = tie.matches.filter((m) => m.status !== "NOT_REQUIRED").length;
  const statusText =
    tie.status === "FINISHED" ? (tie.winner === "DRAW" ? "Tie drawn" : `${winner?.name} win the tie`)
      : tie.status === "DECIDED" ? `${winner?.name} have won · dead rubbers in play`
      : tie.status === "IN_PROGRESS" ? `In progress · ${done} of ${counted} matches complete`
      : "Upcoming";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Link to={base} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg pr-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="h-4 w-4" /> Live
        </Link>
        <ShareButton path={`${base}/tie/${tie.id}`} title={`${a?.name ?? "TBD"} vs ${bt?.name ?? "TBD"}`} />
      </div>

      <motion.header
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={cn("surface relative overflow-hidden", live && "surface-live")}
      >
        <div className="pointer-events-none absolute inset-0" style={teamWash(a, bt, 0.32)} aria-hidden />
        <div className="relative space-y-5 p-4 sm:p-8">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
            <span className="eyebrow">{tie.roundLabel}</span>
            <span className="eyebrow">·</span>
            <span className="eyebrow">{fmtDay(tie.matches[0]?.scheduledAt, tz)}</span>
            {live && <StatusPill status="LIVE" />}
          </div>
          <TieScoreLine tie={tie} big />
          <div className="mx-auto max-w-md"><TieProgress tie={tie} /></div>
          <p className={cn("flex items-center justify-center gap-2 text-center font-display text-lg font-bold uppercase tracking-wide sm:text-xl", tie.status === "FINISHED" && winner ? "text-lime-accent" : "text-muted-foreground")} role="status">
            {tie.status === "FINISHED" && winner && <Trophy className="h-5 w-5" aria-hidden />}
            {statusText}
          </p>
        </div>
      </motion.header>

      <section aria-labelledby="matches-h">
        <h2 id="matches-h" className="eyebrow mb-2.5">Category matches</h2>
        <motion.ul
          className="grid gap-2"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.05 } } }}
        >
          {tie.matches.map((m) => (
            <motion.li key={m.id} variants={reduce ? {} : { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
              <MatchRow m={m} tie={tie} detailed />
            </motion.li>
          ))}
        </motion.ul>
      </section>
    </div>
  );
}
