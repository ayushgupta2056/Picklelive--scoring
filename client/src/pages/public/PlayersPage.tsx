import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Search, UserRound } from "lucide-react";
import { useT } from "@/components/public/context";
import { CategoryBadge, EmptyState, StatusPill, TeamChip } from "@/components/match/bits";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Avatar } from "./TeamsPage";
import { playerStats } from "./stats";
import { PageTitle } from "./PublicRoutes";

export function PlayersPage() {
  const { b, lk, base } = useT();
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  const stats = useMemo(() => playerStats(b), [b]);
  const list = b.players.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()) && (!team || p.teamId === team));
  return (
    <div>
      <PageTitle eyebrow={`${b.players.length} players`} title="Players" />
      <div className="mb-5 space-y-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" placeholder="Search players" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" aria-label="Search players" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by team">
          {[{ id: "", code: "All teams" }, ...b.teams].map((t) => (
            <button key={t.id || "all"} onClick={() => setTeam(t.id)} aria-pressed={team === t.id}
              className={cn("flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", team === t.id ? "border-lime bg-lime/10 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
              {"color" in t && <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} aria-hidden />}
              {t.code}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 && <EmptyState icon={<UserRound className="h-7 w-7" />} title="No players found">Try a different name or team.</EmptyState>}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {list.map((p) => {
          const t = lk.teams.get(p.teamId ?? "");
          const s = stats.get(p.id);
          return (
            <li key={p.id}>
              <Link to={`${base}/players/${p.id}`} className="surface hover-lift flex items-center gap-3 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar name={p.name} url={p.photoUrl} color={t?.color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.gender === "MALE" ? "M" : "F"} · {p.ageGroup}{s && s.played ? ` · ${s.won}W ${s.lost}L` : ""}</span>
                </span>
                <TeamChip team={t} size="sm" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PlayerPage() {
  const { playerId = "" } = useParams();
  const { b, lk, base } = useT();
  const p = lk.players.get(playerId);
  const s = useMemo(() => playerStats(b).get(playerId), [b, playerId]);
  if (!p) return <EmptyState title="Player not found" />;
  const team = lk.teams.get(p.teamId ?? "");
  const winPct = s && s.played ? Math.round((s.won / s.played) * 100) : null;
  return (
    <div className="space-y-8">
      <Link to={`${base}/players`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> All players</Link>
      <header className="surface relative -mt-4 overflow-hidden p-5 sm:p-8">
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(80% 140% at 100% 0%, ${team?.color ?? "#52525B"}44, transparent 60%)` }} />
        <div className="relative flex flex-wrap items-center gap-5">
          <Avatar name={p.name} url={p.photoUrl} color={team?.color} size="xl" />
          <div className="min-w-0 flex-1">
            {team && <Link to={`${base}/teams/${team.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><TeamChip team={team} size="sm" /> {team.name}</Link>}
            <h1 className="mt-1 font-display text-4xl font-extrabold uppercase leading-none tracking-tight sm:text-6xl">{p.name}</h1>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{p.gender === "MALE" ? "Male" : "Female"}</span><span>{p.ageGroup}</span>
              {p.jersey && <span>#{p.jersey}</span>}
              {p.handedness && <span>{p.handedness === "L" ? "Left" : "Right"}-handed</span>}
              {p.skill != null && <span>DUPR {p.skill}</span>}
            </p>
          </div>
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Played", s?.played ?? 0], ["Won", s?.won ?? 0], ["Win rate", winPct == null ? "—" : `${winPct}%`], ["Points won", s?.pointsWon ?? 0]].map(([l, v]) => (
          <div key={l} className="surface flex flex-col-reverse p-4">
            <dt className="mt-1 eyebrow">{l}</dt>
            <dd className="font-display text-4xl font-extrabold leading-none tnum">{v}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="cats-h">
        <h2 id="cats-h" className="mb-3 font-display text-2xl font-bold uppercase tracking-wide">Categories played</h2>
        <div className="flex flex-wrap gap-2">{s && s.categories.size ? [...s.categories].map((c) => <CategoryBadge key={c} category={lk.categories.get(c)} long className="px-2.5 py-1 text-sm" />) : <span className="text-sm text-muted-foreground">None yet</span>}</div>
      </section>
      <section aria-labelledby="pm-h">
        <h2 id="pm-h" className="mb-3 font-display text-2xl font-bold uppercase tracking-wide">Matches</h2>
        {!s?.matchIds.length ? <p className="text-sm text-muted-foreground">No matches yet.</p> : (
          <ul className="surface divide-y divide-border/60 overflow-hidden">
            {s.matchIds.map((id) => {
              const m = lk.matches.get(id)!;
              const t = lk.ties.get(m.tieId)!;
              const mySide = m.lineupA?.includes(playerId) ? "A" : "B";
              const won = m.winner === mySide;
              return (
                <li key={id}>
                  <Link to={`${base}/match/${id}`} className="flex min-h-14 flex-wrap items-center gap-2 px-3 py-2.5 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    {m.winner && <span className={cn("grid h-7 w-7 place-items-center rounded font-display text-sm font-bold", won ? "bg-lime text-black" : "bg-live/80 text-white")} aria-label={won ? "Won" : "Lost"}>{won ? "W" : "L"}</span>}
                    <CategoryBadge category={lk.categories.get(m.categoryId)} />
                    <TeamChip team={lk.teams.get(t.teamAId ?? "")} size="sm" /> <span className="text-xs text-muted-foreground">vs</span> <TeamChip team={lk.teams.get(t.teamBId ?? "")} size="sm" />
                    <span className="ml-auto font-display text-lg font-bold tnum">{m.games.filter((g) => g.winner).map((g) => `${g.a}-${g.b}`).join("  ")}</span>
                    <StatusPill status={m.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
