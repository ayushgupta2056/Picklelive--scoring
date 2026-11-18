import { Link, useParams } from "react-router-dom";
import { Users } from "lucide-react";
import { useT } from "@/components/public/context";
import { TieCard } from "@/components/public/MatchBits";
import { EmptyState, TeamLogo } from "@/components/match/bits";
import { Card } from "@/components/ui/card";
import { playerStats } from "./stats";
import { useMemo } from "react";

export function TeamsPage() {
  const { b, base } = useT();
  const record = (id: string) => {
    const ties = b.ties.filter((t) => t.status === "FINISHED" && (t.teamAId === id || t.teamBId === id));
    const w = ties.filter((t) => (t.winner === "A" && t.teamAId === id) || (t.winner === "B" && t.teamBId === id)).length;
    const d = ties.filter((t) => t.winner === "DRAW").length;
    return `${w}W ${d ? `${d}D ` : ""}${ties.length - w - d}L`;
  };
  if (!b.teams.length) return <EmptyState icon={<Users className="h-8 w-8" />} title="No teams yet" />;
  return (
    <div>
      <h1 className="mb-4 text-2xl font-black">Teams</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {b.teams.map((t) => (
          <Link key={t.id} to={`${base}/teams/${t.id}`}>
            <Card className="flex items-center gap-3 p-4 transition-colors hover:border-lime">
              <TeamLogo team={t} className="h-12 w-12" />
              <div className="min-w-0">
                <div className="truncate font-bold">{t.name}</div>
                <div className="text-sm text-muted-foreground">{b.players.filter((p) => p.teamId === t.id).length} players · {record(t.id)}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
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
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <TeamLogo team={team} className="h-16 w-16 text-lg" />
        <div>
          <h1 className="text-2xl font-black">{team.name}</h1>
          {team.captain && <p className="text-sm text-muted-foreground">Captain: {team.captain}</p>}
        </div>
      </div>
      <section>
        <h2 className="mb-2 text-lg font-bold">Roster</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {roster.map((p) => {
            const s = stats.get(p.id);
            return (
              <li key={p.id}>
                <Link to={`${base}/players/${p.id}`} className="flex items-center gap-3 rounded-xl border p-3 hover:bg-accent/50">
                  <Avatar name={p.name} url={p.photoUrl} color={team.color} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.gender === "MALE" ? "M" : "F"} · {p.ageGroup}{s ? ` · ${s.won}-${s.lost}` : ""}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-bold">Ties</h2>
        <div className="grid gap-3 lg:grid-cols-2">{ties.map((t) => <TieCard key={t.id} tie={t} />)}</div>
      </section>
    </div>
  );
}

export function Avatar({ name, url, color, size = "md" }: { name: string; url?: string | null; color?: string; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "h-20 w-20 text-2xl" : "h-10 w-10 text-sm";
  if (url) return <img src={url} alt="" className={`${cls} shrink-0 rounded-full object-cover`} />;
  const initials = name.split(" ").map((x) => x[0]).slice(0, 2).join("");
  return <span className={`${cls} grid shrink-0 place-items-center rounded-full font-bold text-white`} style={{ background: color ?? "#52525B" }} aria-hidden>{initials}</span>;
}
