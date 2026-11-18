import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Maximize } from "lucide-react";
import { useBundle, useLookups } from "@/hooks/useBundle";
import { useSocketStatus } from "@/lib/socket";
import { cn, contrastText } from "@/lib/utils";
import { fmtTime } from "@/lib/format";
import { AnimatedNumber } from "@/components/match/bits";
import type { DisplaySettings, MatchSummary, PublicPlayer, PublicTeam, TieSummary, TournamentBundle } from "@shared/api";

type Lk = ReturnType<typeof useLookups>;

/**
 * Big-screen TV mode. What it shows is controlled by the admin (Admin → Big display), pushed live:
 *  ALL    – every live tie (falls back to the next ties), layout scales with how many there are
 *  TEAM   – one team's current tie
 *  TIE    – one specific tie
 *  ROTATE – live ties one at a time, auto-rotating
 * URL params (?mode=&team=&tie=) override the admin setting for ad-hoc screens.
 */
export default function TvPage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const q = useBundle(slug);
  const lk = useLookups(q.data);
  const online = useSocketStatus();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    document.title = "TV · PickleLive";
  }, []);

  const b = q.data;
  const display: DisplaySettings = useMemo(() => {
    const base: DisplaySettings = { mode: "ALL", rotateSeconds: 12, showPhotos: true, ...(b?.tournament.settings.display ?? {}) };
    const m = params.get("mode")?.toUpperCase();
    if (m === "ALL" || m === "TEAM" || m === "TIE" || m === "ROTATE") base.mode = m;
    if (params.get("team")) {
      base.mode = "TEAM";
      base.teamId = params.get("team");
    }
    if (params.get("tie")) {
      base.mode = "TIE";
      base.tieId = params.get("tie");
    }
    return base;
  }, [b, params]);

  const pages = useMemo(() => (b ? pagesFor(b, display) : []), [b, display]);
  const [page, setPage] = useState(0);
  const perPage = display.mode === "ROTATE" ? 1 : 6;
  const chunks = useMemo(() => {
    const out: TieSummary[][] = [];
    for (let i = 0; i < pages.length; i += perPage) out.push(pages.slice(i, i + perPage));
    return out;
  }, [pages, perPage]);
  useEffect(() => {
    if (chunks.length <= 1) return setPage(0);
    const t = setInterval(() => setPage((p) => (p + 1) % chunks.length), (display.rotateSeconds ?? 12) * 1000);
    return () => clearInterval(t);
  }, [chunks.length, display.rotateSeconds]);

  if (!b) return <div className="grid h-dvh place-items-center bg-black"><Loader2 className="h-10 w-10 animate-spin text-white" /></div>;
  const current = chunks[page % Math.max(1, chunks.length)] ?? [];
  const n = current.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  // Scale factor: fewer ties on screen → bigger everything.
  const scale = n <= 1 ? 1.6 : n <= 2 ? 1.15 : n <= 4 ? 0.9 : 0.75;

  return (
    <div className="dark flex h-dvh flex-col overflow-hidden bg-[#050506] text-white" style={{ ["--s" as string]: scale }}>
      <header className="flex items-center gap-4 border-b border-white/10 px-[2vw] py-[1vh]">
        <span className="h-[1.4vw] min-h-3 w-[1.4vw] min-w-3 rounded-full bg-[#C6FF00]" />
        <h1 className="truncate text-[clamp(1rem,2vw,3rem)] font-black tracking-tight">{b.tournament.name}</h1>
        <span className="text-[clamp(.8rem,1.2vw,2rem)] font-bold uppercase tracking-widest text-white/50">{label(display, lk)}</span>
        <span className="ml-auto flex items-center gap-4 text-[clamp(1rem,1.8vw,2.6rem)] font-black tnum">
          {!online && <span className="text-[0.6em] text-amber-400">reconnecting…</span>}
          {chunks.length > 1 && <span className="text-[0.6em] text-white/50">{page + 1}/{chunks.length}</span>}
          {fmtTime(new Date(now).toISOString(), b.tournament.timezone)}
        </span>
        <button className="rounded-lg p-2 text-white/40 hover:text-white" onClick={() => document.documentElement.requestFullscreen?.()} aria-label="Full screen"><Maximize /></button>
      </header>
      <main className="min-h-0 flex-1 p-[1.2vw]">
        {n === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-[4vw] font-black">No live ties right now</p>
              <p className="text-[1.6vw] text-white/50">Scores appear here automatically.</p>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={`${display.mode}-${page}-${current.map((t) => t.id).join()}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
              className="grid h-full gap-[1.2vw]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: "minmax(0,1fr)" }}>
              {current.map((t) => <TvTie key={t.id} tie={t} lk={lk} photos={display.showPhotos !== false} b={b} />)}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}

function label(d: DisplaySettings, lk: Lk) {
  if (d.mode === "TEAM") return lk.teams.get(d.teamId ?? "")?.name ?? "Team";
  if (d.mode === "TIE") return "Featured tie";
  if (d.mode === "ROTATE") return "Live courts";
  return "Live ties";
}

const isLiveTie = (t: TieSummary) => t.matches.some((m) => m.status === "LIVE" || m.status === "PAUSED") || t.status === "IN_PROGRESS" || t.status === "DECIDED";
const firstAt = (t: TieSummary) => Math.min(...t.matches.map((m) => (m.scheduledAt ? Date.parse(m.scheduledAt) : Infinity)));

export function pagesFor(b: TournamentBundle, d: DisplaySettings): TieSummary[] {
  const ready = b.ties.filter((t) => t.teamAId && t.teamBId);
  if (d.mode === "TIE") return ready.filter((t) => t.id === d.tieId);
  if (d.mode === "TEAM") {
    const mine = ready.filter((t) => t.teamAId === d.teamId || t.teamBId === d.teamId);
    const live = mine.filter(isLiveTie);
    if (live.length) return live;
    const next = mine.filter((t) => t.status === "SCHEDULED").sort((x, y) => firstAt(x) - firstAt(y))[0];
    const last = mine.filter((t) => t.status === "FINISHED").sort((x, y) => firstAt(y) - firstAt(x))[0];
    return [next ?? last].filter(Boolean) as TieSummary[];
  }
  const live = ready.filter(isLiveTie).sort((x, y) => firstAt(x) - firstAt(y));
  if (live.length) return live;
  return ready.filter((t) => t.status === "SCHEDULED").sort((x, y) => firstAt(x) - firstAt(y)).slice(0, 4);
}

function Face({ p, team, show }: { p?: PublicPlayer; team?: PublicTeam; show: boolean }) {
  if (!show || !p) return null;
  const size = "calc(var(--s) * 2.6vw)";
  if (p.photoUrl) return <img src={p.photoUrl} alt="" className="shrink-0 rounded-full object-cover ring-2 ring-white/20" style={{ width: size, height: size }} />;
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-black" style={{ width: size, height: size, background: team?.color ?? "#444", color: contrastText(team?.color ?? "#444"), fontSize: "calc(var(--s) * 0.9vw)" }}>
      {p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
    </span>
  );
}

function TvTie({ tie, lk, photos, b }: { tie: TieSummary; lk: Lk; photos: boolean; b: TournamentBundle }) {
  const A = lk.teams.get(tie.teamAId ?? "");
  const B = lk.teams.get(tie.teamBId ?? "");
  const shown = tie.matches.filter((m) => m.status !== "NOT_REQUIRED");
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[1vw] border border-white/10 bg-white/[0.03]">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[1vw] px-[1.2vw] py-[1vh]" style={{ background: `linear-gradient(90deg, ${A?.color ?? "#333"}33, transparent 40%, transparent 60%, ${B?.color ?? "#333"}33)` }}>
        <TeamHead team={A} align="right" />
        <div className="flex items-center gap-[0.6vw] font-black tnum" style={{ fontSize: "calc(var(--s) * 4.2vw)", lineHeight: 1 }}>
          <AnimatedNumber value={tie.scoreA} className={cn(tie.winner === "A" && "text-[#C6FF00]")} />
          <span className="text-white/30">–</span>
          <AnimatedNumber value={tie.scoreB} className={cn(tie.winner === "B" && "text-[#C6FF00]")} />
        </div>
        <TeamHead team={B} align="left" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-[0.4vh] px-[0.8vw] pb-[0.8vh]">
        {shown.map((m) => <TvMatchRow key={m.id} m={m} lk={lk} A={A} B={B} photos={photos} tz={b.tournament.timezone} />)}
      </div>
    </section>
  );
}

function TeamHead({ team, align }: { team?: PublicTeam; align: "left" | "right" }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-[0.8vw]", align === "right" && "flex-row-reverse text-right")}>
      {team?.logoUrl ? (
        <img src={team.logoUrl} alt="" className="shrink-0 rounded-[0.5vw] object-cover" style={{ width: "calc(var(--s) * 3.4vw)", height: "calc(var(--s) * 3.4vw)" }} />
      ) : (
        <span className="grid shrink-0 place-items-center rounded-[0.5vw] font-black" style={{ width: "calc(var(--s) * 3.4vw)", height: "calc(var(--s) * 3.4vw)", background: team?.color, color: contrastText(team?.color ?? "#333"), fontSize: "calc(var(--s) * 1.1vw)" }}>{team?.code}</span>
      )}
      <span className="truncate font-black" style={{ fontSize: "calc(var(--s) * 1.7vw)" }}>{team?.name ?? "TBD"}</span>
    </div>
  );
}

function TvMatchRow({ m, lk, A, B, photos, tz }: { m: MatchSummary; lk: Lk; A?: PublicTeam; B?: PublicTeam; photos: boolean; tz: string }) {
  const cat = lk.categories.get(m.categoryId);
  const live = m.status === "LIVE" || m.status === "PAUSED";
  const done = ["FINISHED", "WALKOVER", "RETIRED"].includes(m.status);
  const fs = (k: number) => ({ fontSize: `calc(var(--s) * ${k}vw)` });
  const side = (ids: string[] | null, team: PublicTeam | undefined, s: "A" | "B") => (
    <div className={cn("flex min-w-0 items-center gap-[0.5vw]", s === "A" && "flex-row-reverse text-right", m.winner && m.winner !== s && "opacity-45")}>
      <div className="flex shrink-0 -space-x-[0.6vw]">{ids?.map((id) => <Face key={id} p={lk.players.get(id)} team={team} show={photos} />)}</div>
      <div className="min-w-0 leading-tight">
        {ids ? ids.map((id) => (
          <div key={id} className={cn("truncate font-bold", m.live?.serverId === id && live && m.live.servingTeam === s && "text-[#C6FF00]")} style={fs(1.05)}>{lk.players.get(id)?.name}</div>
        )) : <div className="font-bold text-white/40" style={fs(1.05)}>Lineup TBD</div>}
      </div>
    </div>
  );
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-[0.8vw] rounded-[0.6vw] px-[0.6vw] py-[0.5vh]", live ? "bg-[#FF3B5C]/10 ring-1 ring-[#FF3B5C]/50" : "bg-white/[0.03]")}>
      {side(m.lineupA, A, "A")}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-[0.4vw]">
          <span className="rounded px-[0.4vw] font-black uppercase" style={{ ...fs(0.8), background: `${cat?.color}33`, color: cat?.color }}>{cat?.code}</span>
          <span className="font-bold text-white/60" style={fs(0.8)}>{m.court ?? ""}</span>
          {live && <span className="h-[0.6vw] w-[0.6vw] rounded-full bg-[#FF3B5C] animate-pulse-dot" />}
        </div>
        {live && m.live ? (
          <div className="flex items-baseline gap-[0.6vw] font-black tnum" style={fs(2.6)}>
            <AnimatedNumber value={m.live.score.a} /><span className="text-white/30">-</span><AnimatedNumber value={m.live.score.b} />
          </div>
        ) : done ? (
          <div className="font-black tnum" style={fs(1.3)}>{m.games.filter((g) => g.winner).map((g) => `${g.a}-${g.b}`).join("  ")}</div>
        ) : (
          <div className="font-bold text-white/50 tnum" style={fs(1.1)}>{m.isDecider ? "Decider · " : ""}{fmtTime(m.scheduledAt, tz)}</div>
        )}
        {live && m.games.length > 1 && <div className="text-white/50 tnum" style={fs(0.75)}>{m.games.slice(0, -1).map((g) => `${g.a}-${g.b}`).join(" · ")}</div>}
        {live && (m.live?.matchPoint.length ? <span className="rounded bg-[#C6FF00] px-[0.4vw] font-black text-black" style={fs(0.7)}>MATCH POINT</span> : m.live?.gamePoint.length ? <span className="rounded bg-[#C6FF00] px-[0.4vw] font-black text-black" style={fs(0.7)}>GAME POINT</span> : m.live?.switchEndsAlert ? <span className="rounded bg-white px-[0.4vw] font-black text-black" style={fs(0.7)}>SWITCH ENDS</span> : null)}
      </div>
      {side(m.lineupB, B, "B")}
    </div>
  );
}
