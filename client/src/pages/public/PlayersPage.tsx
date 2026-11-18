import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { useT } from "@/components/public/context";
import { CategoryBadge, EmptyState, StatusPill, TeamChip } from "@/components/match/bits";
import { Input } from "@/components/ui/input";
import { Avatar } from "./TeamsPage";
import { playerStats } from "./stats";

export function PlayersPage() {
  const { b, lk, base } = useT();
  const [q, setQ] = useState("");
  const stats = useMemo(() => playerStats(b), [b]);
  const list = b.players.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <h1 className="mb-4 text-2xl font-black">Players</h1>
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search players" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search players" />
      </div>
      {list.length === 0 && <EmptyState title="No players found" />}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => {
          const t = lk.teams.get(p.teamId ?? "");
          const s = stats.get(p.id);
          return (
            <li key={p.id}>
              <Link to={`${base}/players/${p.id}`} className="flex items-center gap-3 rounded-xl border p-3 hover:bg-accent/50">
                <Avatar name={p.name} url={p.photoUrl} color={t?.color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.ageGroup} · {s ? `${s.won}W ${s.lost}L` : "no matches yet"}</span>
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
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar name={p.name} url={p.photoUrl} color={team?.color} size="lg" />
        <div>
          <h1 className="text-2xl font-black">{p.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <TeamChip team={team} size="sm" /> {team?.name} · {p.gender === "MALE" ? "Male" : "Female"} · {p.ageGroup}
            {p.jersey && ` · #${p.jersey}`}{p.handedness && ` · ${p.handedness === "L" ? "Left" : "Right"}-handed`}{p.skill != null && ` · DUPR ${p.skill}`}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Played", s?.played ?? 0], ["Won", s?.won ?? 0], ["Lost", s?.lost ?? 0], ["Points won", s?.pointsWon ?? 0]].map(([l, v]) => (
          <div key={l} className="rounded-xl border p-4"><div className="text-2xl font-black tnum">{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
        ))}
      </div>
      <section>
        <h2 className="mb-2 text-lg font-bold">Categories played</h2>
        <div className="flex flex-wrap gap-2">{s ? [...s.categories].map((c) => <CategoryBadge key={c} category={lk.categories.get(c)} long />) : <span className="text-sm text-muted-foreground">None yet</span>}</div>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-bold">Matches</h2>
        <ul className="divide-y rounded-xl border">
          {(s?.matchIds ?? []).map((id) => {
            const m = lk.matches.get(id)!;
            const t = lk.ties.get(m.tieId)!;
            return (
              <li key={id}>
                <Link to={`${base}/match/${id}`} className="flex items-center gap-2 p-3 hover:bg-accent/50">
                  <CategoryBadge category={lk.categories.get(m.categoryId)} />
                  <TeamChip team={lk.teams.get(t.teamAId ?? "")} size="sm" /> <span className="text-xs">vs</span> <TeamChip team={lk.teams.get(t.teamBId ?? "")} size="sm" />
                  <span className="ml-auto text-sm font-bold tnum">{m.games.filter((g) => g.winner).map((g) => `${g.a}-${g.b}`).join(" ")}</span>
                  <StatusPill status={m.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
