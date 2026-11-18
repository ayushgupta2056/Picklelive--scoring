import { motion, useReducedMotion, type Variants } from "framer-motion";
import { CalendarClock, History, Radio } from "lucide-react";
import { useT } from "@/components/public/context";
import { LiveMatchCard, TieCard } from "@/components/public/MatchBits";
import { EmptyState, LiveDot } from "@/components/match/bits";
import { cn } from "@/lib/utils";

const time = (s: string | null | undefined) => (s ? new Date(s).getTime() : Number.MAX_SAFE_INTEGER);

function useStagger(): { container: Variants; item: Variants } {
  const reduce = useReducedMotion();
  return {
    container: { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.06 } } },
    item: reduce
      ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
      : { hidden: { opacity: 0, y: 14, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } } },
  };
}

function SectionHead({ id, icon, title, count, live }: { id: string; icon: React.ReactNode; title: string; count?: number; live?: boolean }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 border-b pb-3">
      <h2 id={id} className="flex items-center gap-2.5 font-display text-2xl font-bold uppercase tracking-wide sm:text-3xl">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl", live ? "bg-live/15 text-live" : "bg-muted text-muted-foreground")} aria-hidden>{icon}</span>
        {title}
      </h2>
      {count != null && count > 0 && (
        <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tnum", live ? "bg-live/15 text-live" : "bg-muted text-muted-foreground")}>
          {live && <LiveDot className="h-2 w-2" />}
          {count} {live ? "live" : ""}
        </span>
      )}
    </div>
  );
}

function Grid({ children, className }: { children: React.ReactNode; className?: string }) {
  const { container } = useStagger();
  return (
    <motion.div variants={container} initial="hidden" animate="show" className={cn("grid gap-3 sm:gap-4", className)}>
      {children}
    </motion.div>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  const { item } = useStagger();
  return <motion.div variants={item}>{children}</motion.div>;
}

export default function LiveHome() {
  const { b } = useT();
  const liveTies = b.ties.filter((t) => t.matches.some((m) => m.status === "LIVE" || m.status === "PAUSED") || t.status === "IN_PROGRESS" || t.status === "DECIDED");
  const liveMatches = b.ties.flatMap((t) => t.matches).filter((m) => m.status === "LIVE" || m.status === "PAUSED").sort((a, c) => (a.court ?? "").localeCompare(c.court ?? ""));
  const firstTime = (t: (typeof b.ties)[number]) => Math.min(...t.matches.map((m) => time(m.scheduledAt)), time(t.scheduledAt));
  const upcoming = b.ties.filter((t) => t.status === "SCHEDULED" && t.teamAId && t.teamBId).sort((x, y) => firstTime(x) - firstTime(y)).slice(0, 6);
  const recent = b.ties.filter((t) => t.status === "FINISHED").sort((x, y) => firstTime(y) - firstTime(x)).slice(0, 6);
  const [featured, ...otherLive] = liveTies;

  return (
    <div className="space-y-10 sm:space-y-14">
      <section aria-labelledby="live-h">
        <SectionHead id="live-h" icon={<Radio className="h-5 w-5" />} title="Live now" count={liveMatches.length} live />
        {!featured ? (
          <EmptyState icon={<Radio className="h-7 w-7" />} title="Nothing live right now">Live ties and scores appear here the moment the first serve is hit. No refresh needed.</EmptyState>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Grid>
              <Item><TieCard tie={featured} big /></Item>
              {otherLive.map((t) => <Item key={t.id}><TieCard tie={t} big /></Item>)}
            </Grid>
            {liveMatches.length > 0 && (
              <div>
                <h3 className="eyebrow mb-2.5">On court</h3>
                <Grid className="sm:grid-cols-2 xl:grid-cols-1">
                  {liveMatches.map((m) => <Item key={m.id}><LiveMatchCard m={m} /></Item>)}
                </Grid>
              </div>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="next-h">
        <SectionHead id="next-h" icon={<CalendarClock className="h-5 w-5" />} title="Up next" count={upcoming.length} />
        {upcoming.length ? (
          <Grid className="lg:grid-cols-2">{upcoming.map((t) => <Item key={t.id}><TieCard tie={t} /></Item>)}</Grid>
        ) : <p className="text-sm text-muted-foreground">No upcoming ties scheduled.</p>}
      </section>

      <section aria-labelledby="recent-h">
        <SectionHead id="recent-h" icon={<History className="h-5 w-5" />} title="Recent results" count={recent.length} />
        {recent.length ? (
          <Grid className="lg:grid-cols-2">{recent.map((t) => <Item key={t.id}><TieCard tie={t} /></Item>)}</Grid>
        ) : <p className="text-sm text-muted-foreground">No results yet.</p>}
      </section>
    </div>
  );
}
