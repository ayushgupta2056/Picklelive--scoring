import { Link } from "react-router-dom";
import { CheckCircle2, Circle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CategoryBadge, LiveDot, StatusPill, TeamChip } from "@/components/match/bits";
import { useA } from "./data";
import { PageHeader } from "./ui";

export default function Dashboard() {
  const { t, b, lk, tid } = useA();
  const matches = b.ties.flatMap((x) => x.matches);
  const live = matches.filter((m) => m.status === "LIVE" || m.status === "PAUSED");
  const done = matches.filter((m) => ["FINISHED", "WALKOVER", "RETIRED"].includes(m.status)).length;
  const steps = [
    { ok: t.categories.length > 0, label: "Categories", to: "categories" },
    { ok: t.templates.length > 0, label: "Tie format", to: "formats" },
    { ok: t.teams.length >= 2, label: "Teams", to: "teams" },
    { ok: t.players.length > 0, label: "Players", to: "players" },
    { ok: t.stages.length > 0, label: "Stages & groups", to: "stages" },
    { ok: b.ties.length > 0, label: "Generate ties", to: "stages" },
    { ok: matches.some((m) => m.scheduledAt), label: "Schedule", to: "schedule" },
  ];
  const base = `/admin/t/${tid}`;
  return (
    <div>
      <PageHeader title="Dashboard" description={`Public page: /t/${t.slug}`} />
      <div className="grid gap-3 sm:grid-cols-4">
        {[["Teams", t.teams.length], ["Players", t.players.length], ["Ties", b.ties.length], ["Matches done", `${done}/${matches.length}`]].map(([l, v]) => (
          <Card key={l} className="p-4"><div className="text-3xl font-black tnum">{v}</div><div className="text-sm text-muted-foreground">{l}</div></Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><LiveDot /> Live matches</h2>
          {live.length === 0 && <p className="text-sm text-muted-foreground">No matches live.</p>}
          <ul className="grid gap-2">
            {live.map((m) => {
              const tie = lk.ties.get(m.tieId)!;
              return (
                <li key={m.id}>
                  <Link to={`/t/${t.slug}/match/${m.id}`} target="_blank" className="flex items-center gap-2 rounded-xl border p-3 hover:bg-accent/40">
                    <CategoryBadge category={lk.categories.get(m.categoryId)} />
                    <TeamChip team={lk.teams.get(tie.teamAId ?? "")} size="sm" />
                    <b className="tnum">{m.live?.score.a}-{m.live?.score.b}</b>
                    <TeamChip team={lk.teams.get(tie.teamBId ?? "")} size="sm" />
                    <span className="text-sm text-muted-foreground">{m.court} · G{m.games.length} · {m.live?.call}</span>
                    <span className="ml-auto"><StatusPill status={m.status} /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-bold">Setup checklist</h2>
          <ol className="grid gap-1">
            {steps.map((s, i) => (
              <li key={i}><Link to={`${base}/${s.to}`} className="flex h-11 items-center gap-2 rounded-lg px-2 hover:bg-accent">{s.ok ? <CheckCircle2 className="h-5 w-5 text-lime-accent" /> : <Circle className="h-5 w-5 text-muted-foreground" />} {i + 1}. {s.label}</Link></li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
