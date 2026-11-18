import { cn, contrastText } from "@/lib/utils";
import { fmtTime } from "@/lib/format";
import type { PublicTeam, TieSummary, TournamentBundle } from "@shared/api";
import type { useLookups } from "@/hooks/useBundle";
import { TeamBadge, teamRecord } from "./TvDock";

type Lk = ReturnType<typeof useLookups>;
const LIVE = "#FF3B5C";

/** Right-hand rail for the one-team view: identity, record, group position, every tie and the roster. */
export function TeamPanel({ b, lk, team, u, currentTieIds }: { b: TournamentBundle; lk: Lk; team: PublicTeam; u: number; currentTieIds: string[] }) {
  const rec = teamRecord(b, team.id);
  const standing = b.standings.flatMap((g) => g.rows.map((r) => ({ ...r, groupId: g.groupId }))).find((r) => r.teamId === team.id);
  const group = standing ? b.stages.flatMap((s) => s.groups).find((g) => g.id === standing.groupId) : undefined;
  let mw = 0, ml = 0;
  for (const t of b.ties) for (const m of t.matches) {
    if (!m.winner || (t.teamAId !== team.id && t.teamBId !== team.id)) continue;
    const side = t.teamAId === team.id ? "A" : "B";
    if (m.winner === side) mw++; else ml++;
  }
  const ties = b.ties.filter((t) => t.teamAId === team.id || t.teamBId === team.id).sort((x, y) => (x.matches[0]?.scheduledAt ?? "9").localeCompare(y.matches[0]?.scheduledAt ?? "9"));
  const roster = b.players.filter((p) => p.teamId === team.id);
  const fs = u * 1.05;
  return (
    <aside className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[1.2vmin] border border-white/10 bg-[#0B0B0E]" aria-label={`${team.name} overview`}>
      <div aria-hidden className="absolute inset-x-0 top-0" style={{ height: u * 14, background: `linear-gradient(180deg, ${team.color}55, transparent)` }} />
      <div className="relative flex items-center" style={{ padding: u * 1.2, gap: u }}>
        <TeamBadge team={team} size={u * 5} />
        <div className="min-w-0">
          <div className="font-display font-bold uppercase leading-[0.95] tracking-wide [text-wrap:balance]" style={{ fontSize: u * 2.2 }}>{team.name}</div>
          {team.captain && <div className="truncate text-white/70" style={{ fontSize: fs }}>Capt. {team.captain}</div>}
        </div>
      </div>
      <div className="relative grid grid-cols-3" style={{ paddingInline: u * 1.2, gap: u * 0.6 }}>
        {[
          ["Ties", `${rec.w}-${rec.d ? `${rec.d}-` : ""}${rec.l}`, rec.d ? "W-D-L" : "W-L"],
          ["Matches", `${mw}-${ml}`, "W-L"],
          [group ? group.name : "Rank", standing ? `#${standing.rank}` : "—", standing ? `${standing.tiePoints} pts` : ""],
        ].map(([l, v, s]) => (
          <div key={l} className="rounded-xl border border-white/10 bg-white/[0.04] text-center" style={{ padding: u * 0.6 }}>
            <div className="font-bold uppercase tracking-[0.14em] text-white/60" style={{ fontSize: u * 0.75 }}>{l}</div>
            <div className="score-display" style={{ fontSize: u * 2.4 }}>{v}</div>
            <div className="text-white/60" style={{ fontSize: u * 0.75 }}>{s}</div>
          </div>
        ))}
      </div>
      <div className="relative mt-[1.2vmin] font-bold uppercase tracking-[0.18em] text-white/60" style={{ paddingInline: u * 1.2, fontSize: u * 0.8 }}>Ties</div>
      <ul className="relative min-h-0 flex-1 overflow-hidden" style={{ padding: `${u * 0.4}px ${u * 1.2}px`, display: "grid", gap: u * 0.45, alignContent: "start" }}>
        {ties.map((t) => <TieLine key={t.id} t={t} team={team} lk={lk} tz={b.tournament.timezone} u={u} current={currentTieIds.includes(t.id)} />)}
      </ul>
      {roster.length > 0 && (
        <div className="relative border-t border-white/10" style={{ padding: u * 1.2 }}>
          <div className="mb-[0.6vmin] font-bold uppercase tracking-[0.18em] text-white/60" style={{ fontSize: u * 0.8 }}>Roster</div>
          <div className="flex flex-wrap" style={{ gap: u * 0.5 }}>
            {roster.slice(0, 12).map((p) => (
              p.photoUrl
                ? <img key={p.id} src={p.photoUrl} alt={p.name} title={p.name} className="rounded-full object-cover" style={{ width: u * 2.6, height: u * 2.6, boxShadow: `0 0 0 2px #0B0B0E, 0 0 0 4px ${team.color}` }} />
                : <span key={p.id} title={p.name} className="grid place-items-center rounded-full font-display font-bold" style={{ width: u * 2.6, height: u * 2.6, background: team.color, color: contrastText(team.color), fontSize: u * 1, boxShadow: `0 0 0 2px #0B0B0E, 0 0 0 4px ${team.color}66` }}>{p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function TieLine({ t, team, lk, tz, u, current }: { t: TieSummary; team: PublicTeam; lk: Lk; tz: string; u: number; current: boolean }) {
  const side = t.teamAId === team.id ? "A" : "B";
  const opp = lk.teams.get((side === "A" ? t.teamBId : t.teamAId) ?? "");
  const live = t.matches.some((m) => m.status === "LIVE" || m.status === "PAUSED");
  const mine = side === "A" ? t.scoreA : t.scoreB;
  const theirs = side === "A" ? t.scoreB : t.scoreA;
  const result = t.status === "FINISHED" ? (t.winner === "DRAW" ? "D" : t.winner === side ? "W" : "L") : null;
  return (
    <li className={cn("flex items-center rounded-xl border", current ? "border-[#C6FF00]/60 bg-[#C6FF00]/[0.06]" : live ? "border-[#FF3B5C]/50 bg-[#FF3B5C]/[0.06]" : "border-white/10 bg-white/[0.03]")} style={{ padding: `${u * 0.55}px ${u * 0.8}px`, gap: u * 0.7 }}>
      <span className="grid shrink-0 place-items-center rounded-md font-display font-extrabold" style={{ width: u * 2, height: u * 2, fontSize: u * 1.1, background: result === "W" ? "#C6FF00" : result === "L" ? "rgba(255,255,255,.12)" : result === "D" ? "#FBBF24" : "transparent", color: result === "W" || result === "D" ? "#000" : "#fff", boxShadow: result ? undefined : "inset 0 0 0 1px rgba(255,255,255,.2)" }}>
        {result ?? (live ? <span className="h-[0.6em] w-[0.6em] rounded-full" style={{ background: LIVE }} /> : null)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display font-bold uppercase tracking-wide" style={{ fontSize: u * 1.15 }}>vs {opp?.name ?? "TBD"}</span>
        <span className="block truncate text-white/60" style={{ fontSize: u * 0.8 }}>{t.roundLabel}{t.status === "SCHEDULED" ? ` · ${fmtTime(t.matches[0]?.scheduledAt, tz)}` : ""}</span>
      </span>
      {t.status !== "SCHEDULED" && <span className="score-display shrink-0" style={{ fontSize: u * 1.8 }}>{mine}<span className="text-white/35">–</span>{theirs}</span>}
    </li>
  );
}
