import { CalendarClock, History, Radio } from "lucide-react";
import { useT } from "@/components/public/context";
import { LiveMatchCard, TieCard } from "@/components/public/MatchBits";
import { EmptyState } from "@/components/match/bits";

const time = (s: string | null | undefined) => (s ? new Date(s).getTime() : Number.MAX_SAFE_INTEGER);

export default function LiveHome() {
  const { b } = useT();
  const liveTies = b.ties.filter((t) => t.matches.some((m) => m.status === "LIVE" || m.status === "PAUSED") || t.status === "IN_PROGRESS" || t.status === "DECIDED");
  const liveMatches = b.ties.flatMap((t) => t.matches).filter((m) => m.status === "LIVE" || m.status === "PAUSED").sort((a, c) => (a.court ?? "").localeCompare(c.court ?? ""));
  const firstTime = (t: (typeof b.ties)[number]) => Math.min(...t.matches.map((m) => time(m.scheduledAt)), time(t.scheduledAt));
  const upcoming = b.ties.filter((t) => t.status === "SCHEDULED" && t.teamAId && t.teamBId).sort((x, y) => firstTime(x) - firstTime(y)).slice(0, 6);
  const recent = b.ties.filter((t) => t.status === "FINISHED").sort((x, y) => firstTime(y) - firstTime(x)).slice(0, 6);

  return (
    <div className="space-y-8">
      <section aria-labelledby="live-h">
        <h2 id="live-h" className="mb-3 flex items-center gap-2 text-lg font-black uppercase tracking-wide"><Radio className="h-5 w-5 text-live" /> Live now</h2>
        {liveTies.length === 0 ? (
          <EmptyState icon={<Radio className="h-8 w-8" />} title="Nothing live right now">Live ties and scores appear here automatically, no need to refresh.</EmptyState>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">{liveTies.map((t) => <TieCard key={t.id} tie={t} big />)}</div>
        )}
        {liveMatches.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{liveMatches.map((m) => <LiveMatchCard key={m.id} m={m} />)}</div>
        )}
      </section>
      <section aria-labelledby="next-h">
        <h2 id="next-h" className="mb-3 flex items-center gap-2 text-lg font-black uppercase tracking-wide"><CalendarClock className="h-5 w-5" /> Up next</h2>
        {upcoming.length ? <div className="grid gap-3 lg:grid-cols-2">{upcoming.map((t) => <TieCard key={t.id} tie={t} />)}</div> : <p className="text-sm text-muted-foreground">No upcoming ties scheduled.</p>}
      </section>
      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="mb-3 flex items-center gap-2 text-lg font-black uppercase tracking-wide"><History className="h-5 w-5" /> Recent results</h2>
        {recent.length ? <div className="grid gap-3 lg:grid-cols-2">{recent.map((t) => <TieCard key={t.id} tie={t} />)}</div> : <p className="text-sm text-muted-foreground">No results yet.</p>}
      </section>
    </div>
  );
}
