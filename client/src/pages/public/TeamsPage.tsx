import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Users } from "lucide-react";
import { useT } from "@/components/public/context";
import { TieCard } from "@/components/public/MatchBits";
import { EmptyState, TeamLogo } from "@/components/match/bits";
import { cn, contrastText } from "@/lib/utils";
import type { TournamentBundle } from "@shared/api";
import { playerStats } from "./stats";
import { PageTitle } from "./PublicRoutes";

function record(b: TournamentBundle, id: string) {
  const ties = b.ties.filter((t) => t.status === "FINISHED" && (t.teamAId === id || t.teamBId === id));
  const w = ties.filter((t) => (t.winner === "A" && t.teamAId === id) || (t.winner === "B" && t.teamBId === id)).length;
  const d = ties.filter((t) => t.winner === "DRAW").length;
  return { w, d, l: ties.length - w - d, played: ties.length };
}

export function TeamsPage() {
  const { b, base } = useT();
  if (!b.teams.length) return (<><PageTitle title="Teams" /><EmptyState icon={<Users className="h-7 w-7" />} title="No teams yet" /></>);
  return (
    <div>
      <PageTitle eyebrow={`${b.teams.length} teams`} title="Teams" />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {b.teams.map((t) => {
          const r = record(b, t.id);
          const roster = b.players.filter((p) => p.teamId === t.id).length;
          return (
            <li key={t.id}>
              <Link to={`${base}/teams/${t.id}`} className="surface hover-lift group relative block overflow-hidden p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
                <span aria-hidden className="pointer-events-none absolute inset-0 opacity-90" style={{ background: `radial-gradient(120% 90% at 0% 0%, ${t.color}33, transparent 60%)` }} />
                <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: t.color }} />
                <div className="relative flex items-center gap-4">
                  <TeamLogo team={t} className="h-14 w-14 text-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-2xl font-bold uppercase leading-tight tracking-wide">{t.name}</div>
                    <div className="text-sm text-muted-foreground">{roster} players{t.captain ? ` · Capt. ${t.captain.split(" ")[0]}` : ""}</div>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
                </div>
                <dl className="relative mt-4 grid grid-cols-3 gap-2 text-center">
                  {([["W", r.w], ["D", r.d], ["L", r.l]] as const).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-background/60 py-1.5 ring-1 ring-border/60">
                      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{k === "W" ? "Won" : k === "D" ? "Drawn" : "Lost"}</dt>
                      <dd className="font-display text-xl font-bold tnum">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TeamPage() {
  const { teamId = "" } = useParams();
  const { b, lk, base } = useT();
  const team = lk.teams.get(teamId);
  const stats = useMemo(() => playerStats(b), [b]);
  if (!team) return <EmptyState title="Team not found" />;
  const roster = b.players.filter((p) => p.teamId === teamId);
  const ties = b.ties.filter((t) => t.teamAId === teamId || t.teamBId === teamId);
  const r = record(b, teamId);
  const standing = b.standings.flatMap((s) => s.rows).find((row) => row.teamId === teamId);
  return (
    <div className="space-y-8">
      <Link to={`${base}/teams`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> All teams</Link>
      <header className="surface relative -mt-4 overflow-hidden p-5 sm:p-8">
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(90% 140% at 0% 0%, ${team.color}55, transparent 60%)` }} />
        <div className="relative flex flex-wrap items-center gap-5">
          <TeamLogo team={team} className="h-20 w-20 text-2xl sm:h-24 sm:w-24" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Team · {team.code}</p>
            <h1 className="font-display text-4xl font-extrabold uppercase leading-none tracking-tight sm:text-6xl">{team.name}</h1>
            {team.captain && <p className="mt-2 text-sm text-muted-foreground">Captain {team.captain}</p>}
          </div>
          <dl className="grid w-full grid-cols-4 gap-2 text-center sm:w-auto sm:gap-3">
            {[["Played", r.played], ["Won", r.w], ["Lost", r.l], ["Points", standing?.tiePoints ?? 0]].map(([k, v]) => (
              <div key={k} className="flex min-w-0 flex-col-reverse rounded-xl sm:min-w-16 bg-background/60 px-3 py-2 ring-1 ring-border/60">
                <dt className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{k}</dt>
                <dd className="font-display text-3xl font-extrabold leading-none tnum">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>
      <section aria-labelledby="roster-h">
        <h2 id="roster-h" className="mb-3 font-display text-2xl font-bold uppercase tracking-wide">Roster</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {roster.map((p) => {
            const s = stats.get(p.id);
            return (
              <li key={p.id}>
                <Link to={`${base}/players/${p.id}`} className="surface hover-lift flex items-center gap-3 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar name={p.name} url={p.photoUrl} color={team.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.gender === "MALE" ? "M" : "F"} · {p.ageGroup}{p.jersey ? ` · #${p.jersey}` : ""}</span>
                  </span>
                  {s && s.played > 0 && <span className="font-display text-lg font-bold tnum text-muted-foreground">{s.won}-{s.lost}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-labelledby="ties-h">
        <h2 id="ties-h" className="mb-3 font-display text-2xl font-bold uppercase tracking-wide">Ties</h2>
        {ties.length ? <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 [&>*]:min-w-0">{ties.map((t) => <TieCard key={t.id} tie={t} />)}</div> : <p className="text-sm text-muted-foreground">No ties yet.</p>}
      </section>
    </div>
  );
}

export function Avatar({ name, url, color, size = "md" }: { name: string; url?: string | null; color?: string; size?: "md" | "lg" | "xl" }) {
  const cls = size === "xl" ? "h-28 w-28 text-4xl" : size === "lg" ? "h-20 w-20 text-2xl" : "h-11 w-11 text-sm";
  const ring = { boxShadow: `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${color ?? "#52525B"}` };
  if (url) return <img src={url} alt="" className={cn(cls, "shrink-0 rounded-full object-cover")} style={ring} loading="lazy" />;
  const initials = name.split(" ").map((x) => x[0]).slice(0, 2).join("");
  const bg = color ?? "#52525B";
  return (
    <span className={cn(cls, "grid shrink-0 place-items-center rounded-full font-display font-bold")} style={{ background: `linear-gradient(135deg, ${bg}, ${bg}bb)`, color: contrastText(bg), ...ring }} aria-hidden>
      {initials}
    </span>
  );
}
