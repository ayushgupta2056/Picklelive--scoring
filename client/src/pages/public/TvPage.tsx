import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeftRight, Check, ChevronDown, Loader2, Maximize, Swords, Users, WifiOff } from "lucide-react";
import { TvDock, type TvSelection } from "@/components/tv/TvDock";
import { TeamPanel } from "@/components/tv/TeamPanel";
import { useBundle, useLookups } from "@/hooks/useBundle";
import { useSocketStatus } from "@/lib/socket";
import { cn, contrastText } from "@/lib/utils";
import { fmtTime } from "@/lib/format";
import { AnimatedNumber } from "@/components/match/bits";
import type { DisplaySettings, MatchSummary, PublicPlayer, PublicTeam, TieSummary, TournamentBundle } from "@shared/api";

type Lk = ReturnType<typeof useLookups>;

const LIME = "#C6FF00";
const LIVE = "#FF3B5C";
const DONE = ["FINISHED", "WALKOVER", "RETIRED"];

/**
 * Big-screen TV mode. What it shows is controlled by the admin (Admin → Big display), pushed live:
 *  ALL    – every live tie (falls back to the next ties), layout scales with how many there are
 *  TEAM   – one team's current tie
 *  TIE    – one specific tie
 *  ROTATE – live ties one at a time, auto-rotating
 * URL params (?mode=&team=&tie=) override the admin setting for ad-hoc screens.
 *
 * Every size is computed from the viewport (see `useLayout`), so 1–6 ties always fit with no scrolling
 * or clipping from 720p to 4K.
 */
export default function TvPage() {
  const { slug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const q = useBundle(slug);
  const lk = useLookups(q.data);
  const online = useSocketStatus();
  const reduce = useReducedMotion();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    document.title = "TV · PickleLive";
  }, []);

  const b = q.data;
  // What to show: this screen's own choice (kept in the URL so a refresh keeps it) overrides the admin default.
  const overridden = params.has("mode") || params.has("team") || params.has("tie");
  const display: DisplaySettings = useMemo(() => {
    const base: DisplaySettings = { mode: "ALL", rotateSeconds: 12, showPhotos: true, ...(b?.tournament.settings.display ?? {}) };
    if (overridden) {
      base.teamId = null;
      base.tieId = null;
    }
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
  }, [b, params, overridden]);
  // A team/tie that doesn't exist (deleted, or ids changed after re-seeding) asks for a choice instead of going blank.
  const needsPick: "TEAM" | "TIE" | null = !b ? null
    : display.mode === "TEAM" && !lk.teams.has(display.teamId ?? "") ? "TEAM"
    : display.mode === "TIE" && !b.ties.some((t) => t.id === display.tieId && t.teamAId && t.teamBId) ? "TIE"
    : null;
  const select = (sel: TvSelection) => {
    const next = new URLSearchParams();
    if (sel.mode === "TEAM" && sel.teamId) next.set("team", sel.teamId);
    else if (sel.mode === "TIE" && sel.tieId) next.set("tie", sel.tieId);
    else next.set("mode", sel.mode.toLowerCase());
    setParams(next, { replace: true });
  };
  const followAdmin = () => setParams(new URLSearchParams(), { replace: true });
  const teamMode = display.mode === "TEAM" && !needsPick;
  const focusTeam = teamMode ? lk.teams.get(display.teamId!) : undefined;

  const pages = useMemo(() => (b ? pagesFor(b, display) : []), [b, display]);
  const [page, setPage] = useState(0);
  const perPage = display.mode === "ROTATE" ? 1 : 6;
  const chunks = useMemo(() => {
    const out: TieSummary[][] = [];
    for (let i = 0; i < pages.length; i += perPage) out.push(pages.slice(i, i + perPage));
    return out;
  }, [pages, perPage]);
  const rotateMs = (display.rotateSeconds ?? 12) * 1000;
  useEffect(() => {
    if (chunks.length <= 1) return setPage(0);
    const t = setInterval(() => setPage((p) => (p + 1) % chunks.length), rotateMs);
    return () => clearInterval(t);
  }, [chunks.length, rotateMs]);

  const current = chunks[page % Math.max(1, chunks.length)] ?? [];
  const maxMatches = Math.max(1, ...current.map((t) => t.matches.filter((m) => m.status !== "NOT_REQUIRED").length));
  const L = useLayout(current.length, maxMatches, teamMode ? 0.27 : 0);

  if (!b) return <div className="grid h-dvh place-items-center bg-[#030304]"><Loader2 className="h-10 w-10 animate-spin text-white" /></div>;

  const allMatches = b.ties.flatMap((t) => t.matches);
  const liveCount = allMatches.filter((m) => m.status === "LIVE" || m.status === "PAUSED").length;
  const courtsInPlay = new Set(allMatches.filter((m) => m.status === "LIVE" && m.court).map((m) => m.court)).size;
  const multiPage = chunks.length > 1;

  return (
    <div className="dark relative flex h-dvh flex-col overflow-hidden bg-[#030304] font-sans text-white" style={L.vars}>
      {/* ambient backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(198,255,0,0.07),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(255,59,92,0.05),transparent_50%)]" />

      {/* header bar */}
      <header className="group relative z-10 flex shrink-0 items-center border-b border-white/10 bg-black/60 backdrop-blur" style={{ height: L.headerH, paddingInline: L.pad, gap: L.pad }}>
        <span className="shrink-0 rounded-full" style={{ width: L.u * 1.1, height: L.u * 1.1, background: LIME, boxShadow: `0 0 ${L.u}px ${LIME}88` }} aria-hidden />
        <h1 className="min-w-0 truncate font-display font-bold uppercase tracking-wide" style={{ fontSize: L.u * 2.1, lineHeight: 1 }}>{b.tournament.name}</h1>
        <span className="flex shrink-0 items-center gap-[0.4em] rounded-md border border-white/15 bg-white/5 px-[0.6em] py-[0.15em] font-display font-semibold uppercase tracking-[0.18em] text-white/75" style={{ fontSize: L.u * 0.95 }}>
          {display.mode === "TEAM" && focusTeam && <span className="h-[0.7em] w-[0.7em] rounded-full" style={{ background: focusTeam.color }} />}
          {needsPick ? "Choose a view" : modeLabel(display, lk)}
        </span>
        <div className="ml-auto flex shrink-0 items-center" style={{ gap: L.pad }}>
          {!online && (
            <span className="flex items-center gap-[0.4em] font-semibold text-amber-300" style={{ fontSize: L.u * 0.95 }} role="status"><WifiOff style={{ width: "1.1em", height: "1.1em" }} /> Reconnecting</span>
          )}
          {liveCount > 0 && (
            <span className="flex items-center gap-[0.5em] rounded-full px-[0.8em] py-[0.25em] font-display font-bold uppercase tracking-[0.14em]" style={{ fontSize: L.u * 1.05, background: `${LIVE}22`, color: "#FF6B85", boxShadow: `inset 0 0 0 1px ${LIVE}66` }}>
              <LivePip size={L.u * 0.7} /> {liveCount} live{courtsInPlay ? ` · ${courtsInPlay} court${courtsInPlay > 1 ? "s" : ""}` : ""}
            </span>
          )}
          {multiPage && (
            <span className="flex items-center" style={{ gap: L.u * 0.35 }} aria-label={`Page ${page + 1} of ${chunks.length}`}>
              {chunks.map((_, i) => (
                <span key={i} className="rounded-full transition-all duration-300" style={{ height: L.u * 0.45, width: i === page ? L.u * 1.6 : L.u * 0.45, background: i === page ? LIME : "rgba(255,255,255,.3)" }} />
              ))}
            </span>
          )}
          <span className="score-display" style={{ fontSize: L.u * 2.6 }}>{fmtTime(new Date(now).toISOString(), b.tournament.timezone)}</span>
          <button className="grid place-items-center rounded-lg text-white/60 opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 group-hover:opacity-100" style={{ width: L.u * 2.4, height: L.u * 2.4 }} onClick={() => document.documentElement.requestFullscreen?.()} aria-label="Full screen">
            <Maximize style={{ width: L.u * 1.2, height: L.u * 1.2 }} />
          </button>
        </div>
        {multiPage && !reduce && (
          <motion.span key={`prog-${page}`} aria-hidden className="absolute bottom-0 left-0 h-[2px] origin-left" style={{ width: "100%", background: LIME }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: rotateMs / 1000, ease: "linear" }} />
        )}
      </header>

      {/* ties */}
      <main className="relative z-0 min-h-0 flex-1" style={{ padding: L.pad }}>
        {needsPick ? (
          <div className="grid h-full place-items-center text-center">
            <div className="flex flex-col items-center" style={{ gap: L.u }}>
              <span className="grid place-items-center rounded-3xl border border-white/10 bg-white/5" style={{ width: L.u * 7, height: L.u * 7 }}>
                {needsPick === "TEAM" ? <Users style={{ width: L.u * 3.4, height: L.u * 3.4 }} className="text-[#C6FF00]" /> : <Swords style={{ width: L.u * 3.4, height: L.u * 3.4 }} className="text-[#C6FF00]" />}
              </span>
              <p className="font-display font-bold uppercase tracking-wide" style={{ fontSize: L.u * 3.6 }}>Select {needsPick === "TEAM" ? "a team" : "a tie"} to display</p>
              <p className="flex items-center gap-2 text-white/70" style={{ fontSize: L.u * 1.4 }}>Pick one from the panel below <ChevronDown style={{ width: "1.2em", height: "1.2em" }} /></p>
            </div>
          </div>
        ) : current.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="font-display font-bold uppercase tracking-wide" style={{ fontSize: L.u * 4 }}>No live ties right now</p>
              <p className="text-white/70" style={{ fontSize: L.u * 1.6 }}>Scores appear here automatically.</p>
            </div>
          </div>
        ) : (
          <div className={cn("h-full", teamMode && focusTeam && "grid")} style={teamMode ? { gridTemplateColumns: `minmax(0,1fr) ${L.sideW}px`, gap: L.pad } : undefined}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${display.mode}-${display.teamId ?? ""}-${display.tieId ?? ""}-${page}-${current.map((t) => t.id).join()}`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{ duration: reduce ? 0.15 : 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="grid h-full"
              style={{ gridTemplateColumns: `repeat(${L.cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${L.rows}, minmax(0,1fr))`, gap: L.pad }}
            >
              {current.map((t, i) => (
                <motion.div key={t.id} className="min-h-0 min-w-0" initial={reduce ? false : { opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: reduce ? 0 : i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
                  <TvTie tie={t} lk={lk} photos={display.showPhotos !== false} tz={b.tournament.timezone} L={L} />
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
          {teamMode && focusTeam && <TeamPanel b={b} lk={lk} team={focusTeam} u={L.u} currentTieIds={current.map((t) => t.id)} />}
          </div>
        )}
      </main>

      <Ticker b={b} lk={lk} L={L} />
      <TvDock b={b} lk={lk} effective={{ mode: display.mode, teamId: display.teamId, tieId: display.tieId }} overridden={overridden} forceOpenTab={needsPick} onSelect={select} onFollowAdmin={followAdmin} />
    </div>
  );
}

// ------------------------------------------------------------------ layout maths

interface Layout {
  u: number; // base unit in px (~1vw at 16:9, constrained by height)
  pad: number;
  headerH: number;
  tickerH: number;
  cols: number;
  rows: number;
  // per-tie sizes in px
  headH: number;
  rowH: number;
  cardW: number;
  sideW: number;
  vars: React.CSSProperties;
}

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

/** Grid shape and every font/box size, derived from viewport, number of ties and matches per tie. */
function useLayout(n: number, matches: number, sideFrac = 0): Layout {
  const { w, h } = useViewport();
  return useMemo(() => {
    const u = Math.min(w / 100, (h / 100) * 1.7778);
    const pad = Math.max(8, u * 1.1);
    const headerH = Math.max(48, u * 4.6);
    const tickerH = Math.max(40, u * 3.4);
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
    const rows = Math.max(1, Math.ceil(n / cols));
    const sideW = sideFrac ? Math.max(300, w * sideFrac) : 0;
    const cardW = (w - pad * (cols + 1) - (sideW ? sideW + pad : 0)) / cols;
    const cardH = (h - headerH - tickerH - pad * (rows + 1)) / rows;
    // Head takes ~28% of a card (capped so a single tie doesn't get a giant header); match rows share the rest.
    const headH = Math.min(cardH * (rows === 1 ? 0.24 : 0.28), cardW * 0.2);
    const inner = Math.max(4, u * 0.5);
    const rowH = (cardH - headH - inner * (matches + 1)) / matches;
    const vars = { "--tv-u": `${u}px` } as React.CSSProperties;
    return { u, pad, headerH, tickerH, cols, rows, headH, rowH, cardW, sideW, vars };
  }, [w, h, n, matches, sideFrac]);
}

// ------------------------------------------------------------------ pieces

function modeLabel(d: DisplaySettings, lk: Lk) {
  if (d.mode === "TEAM") return lk.teams.get(d.teamId ?? "")?.name ?? "Team";
  if (d.mode === "TIE") {
    const t = lk.ties.get(d.tieId ?? "");
    return t ? `Featured · ${t.roundLabel ?? "Tie"}` : "Featured tie";
  }
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

function LivePip({ size }: { size: number }) {
  const reduce = useReducedMotion();
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden>
      {!reduce && <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: LIVE }} />}
      <span className="relative h-full w-full rounded-full" style={{ background: LIVE }} />
    </span>
  );
}

function Face({ p, team, show, size }: { p?: PublicPlayer; team?: PublicTeam; show: boolean; size: number }) {
  if (!show || !p) return null;
  const ring = { boxShadow: `0 0 0 ${Math.max(2, size * 0.06)}px #030304, 0 0 0 ${Math.max(3, size * 0.1)}px ${team?.color ?? "#555"}` };
  if (p.photoUrl) return <img src={p.photoUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size, ...ring }} />;
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-display font-bold" style={{ width: size, height: size, background: team?.color ?? "#444", color: contrastText(team?.color ?? "#444"), fontSize: size * 0.4, ...ring }}>
      {p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
    </span>
  );
}

function TvTie({ tie, lk, photos, tz, L }: { tie: TieSummary; lk: Lk; photos: boolean; tz: string; L: Layout }) {
  const A = lk.teams.get(tie.teamAId ?? "");
  const B = lk.teams.get(tie.teamBId ?? "");
  const shown = tie.matches.filter((m) => m.status !== "NOT_REQUIRED");
  const live = tie.matches.some((m) => m.status === "LIVE" || m.status === "PAUSED");
  const H = L.headH;
  const scoreFs = Math.min(H * 0.72, L.cardW * 0.11);
  const logo = Math.min(H * 0.56, L.cardW * 0.09);
  // Fit the longer team name on one line: each side gets ~half the card minus the score block and logo.
  const sideW = (L.cardW - scoreFs * 2.6 - L.u * 6) / 2 - logo;
  const longest = Math.max(A?.name.length ?? 3, B?.name.length ?? 3);
  // One line if it fits; otherwise allow two balanced lines (≈60% of the characters on the longer line).
  const oneLine = sideW / (longest * 0.6);
  const twoLine = Math.min(H * 0.21, sideW / (longest * 0.62 * 0.6));
  const longestWord = Math.max(...[A?.name, B?.name].flatMap((n) => (n ?? "TBD").split(/\s+/)).map((x) => x.length));
  const nameFs = Math.max(10, Math.min(H * 0.26, L.cardW * 0.045, Math.max(oneLine, twoLine), sideW / (longestWord * 0.68)));
  const status = tie.status === "FINISHED" ? (tie.winner === "DRAW" ? "Final · Draw" : `Final · ${(tie.winner === "A" ? A : B)?.code} win`) : tie.status === "DECIDED" ? `${(tie.winner === "A" ? A : B)?.code} clinched` : live ? "Live" : tie.status === "SCHEDULED" ? `Starts ${fmtTime(tie.matches[0]?.scheduledAt, tz)}` : "In progress";
  const inner = Math.max(4, L.u * 0.5);
  return (
    <section
      className={cn("relative flex h-full flex-col overflow-hidden rounded-[1.2vmin] border bg-[#0B0B0E]", live ? "border-[#FF3B5C]/45" : "border-white/10")}
      style={live ? { boxShadow: `0 0 0 1px ${LIVE}33, 0 0 ${L.u * 3}px -${L.u}px ${LIVE}66` } : undefined}
      aria-label={`${A?.name} vs ${B?.name}`}
    >
      {/* head with team color washes */}
      <div className="relative grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center" style={{ height: H, paddingInline: L.u * 1.2, gap: L.u * 1.2 }}>
        <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${A?.color ?? "#333"}59 0%, ${A?.color ?? "#333"}14 34%, transparent 50%, ${B?.color ?? "#333"}14 66%, ${B?.color ?? "#333"}59 100%)` }} />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-white/10" />
        <TeamHead team={A} align="right" fs={nameFs} logo={logo} won={tie.winner === "A"} />
        <div className="relative flex flex-col items-center">
          <div className="flex items-center score-display" style={{ fontSize: scoreFs, gap: scoreFs * 0.12 }}>
            <AnimatedNumber value={tie.scoreA} className={cn(tie.winner === "A" && "text-[#C6FF00]")} />
            <span className="text-white/35" style={{ fontSize: scoreFs * 0.6 }}>–</span>
            <AnimatedNumber value={tie.scoreB} className={cn(tie.winner === "B" && "text-[#C6FF00]")} />
          </div>
          <span className={cn("mt-[0.2em] whitespace-nowrap font-display font-bold uppercase tracking-[0.16em]", live ? "text-[#FF6B85]" : tie.status === "FINISHED" || tie.status === "DECIDED" ? "text-[#C6FF00]" : "text-white/70")} style={{ fontSize: Math.max(11, nameFs * 0.5) }}>
            {status}
          </span>
        </div>
        <TeamHead team={B} align="left" fs={nameFs} logo={logo} won={tie.winner === "B"} />
      </div>
      {/* category rows */}
      <div className="flex min-h-0 flex-1 flex-col" style={{ padding: inner, gap: inner }}>
        {shown.map((m) => <TvMatchRow key={m.id} m={m} lk={lk} A={A} B={B} photos={photos} tz={tz} h={Math.max(24, L.rowH)} w={L.cardW} />)}
      </div>
    </section>
  );
}

function TeamHead({ team, align, fs, logo, won }: { team?: PublicTeam; align: "left" | "right"; fs: number; logo: number; won: boolean }) {
  return (
    <div className={cn("relative flex min-w-0 items-center", align === "right" && "flex-row-reverse text-right")} style={{ gap: fs * 0.5 }}>
      {team?.logoUrl ? (
        <img src={team.logoUrl} alt="" className="shrink-0 rounded-xl object-cover shadow-lg" style={{ width: logo, height: logo }} />
      ) : (
        <span className="grid shrink-0 place-items-center rounded-xl font-display font-extrabold shadow-lg" style={{ width: logo, height: logo, background: team?.color, color: contrastText(team?.color ?? "#333"), fontSize: logo * 0.36 }}>{team?.code}</span>
      )}
      <span className="min-w-0">
        <span className="line-clamp-2 block font-display font-bold uppercase leading-[0.95] tracking-wide [text-wrap:balance]" style={{ fontSize: fs }}>{team?.name ?? "TBD"}</span>
        {won && <span className="mt-[0.25em] inline-flex items-center gap-1 font-display font-bold uppercase tracking-[0.16em] text-[#C6FF00]" style={{ fontSize: Math.max(10, fs * 0.42) }}><Check style={{ width: "1.1em", height: "1.1em" }} strokeWidth={3} /> Winner</span>}
      </span>
    </div>
  );
}

function TvMatchRow({ m, lk, A, B, photos, tz, h, w }: { m: MatchSummary; lk: Lk; A?: PublicTeam; B?: PublicTeam; photos: boolean; tz: string; h: number; w: number }) {
  const cat = lk.categories.get(m.categoryId);
  const live = m.status === "LIVE" || m.status === "PAUSED";
  const done = DONE.includes(m.status);
  const doubles = (m.lineupA?.length ?? m.lineupB?.length ?? 2) > 1;
  // sizes from the row box: two name lines must fit in the row height
  const nameFs = Math.min(h * (doubles ? 0.3 : 0.4), w * 0.03);
  const face = Math.min(h * 0.66, w * 0.052);
  const smallFs = Math.max(10, Math.min(h * 0.17, w * 0.018));
  // centre stack = badge line + score + (live) flag line; the score gets whatever height is left
  // Short rows (many ties on a small screen) put badge, court and score on one line.
  const compact = h < 56;
  const stackLines = compact ? 0 : 1;
  const scoreFs = Math.max(10, Math.min((h * 0.9 - smallFs * 1.35 * stackLines) / 0.95, w * 0.07));
  const gamesDone = m.games.filter((g) => g.winner);
  const shortNames = w < 560;
  const pname = (id: string) => {
    const n = lk.players.get(id)?.name ?? "";
    if (!shortNames) return n;
    const [first, ...rest] = n.split(" ");
    return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
  };

  const side = (ids: string[] | null, team: PublicTeam | undefined, s: "A" | "B") => {
    const lost = done && m.winner && m.winner !== s;
    const serving = live && m.live?.servingTeam === s;
    return (
      <div className={cn("flex min-w-0 items-center", s === "A" && "flex-row-reverse text-right")} style={{ gap: nameFs * 0.6, opacity: lost ? 0.55 : 1 }}>
        {photos && ids && (
          <div className="flex shrink-0" style={{ marginInline: face * 0.1 }}>
            {ids.map((id, i) => <span key={id} className="relative" style={{ marginLeft: i ? -face * 0.12 : 0, zIndex: ids.length - i }}><Face p={lk.players.get(id)} team={team} show size={face} /></span>)}
          </div>
        )}
        <div className="min-w-0 leading-[1.12]">
          {ids ? ids.map((id) => {
            const isServer = serving && m.live?.serverId === id;
            return (
              <div key={id} className={cn("flex items-center truncate font-semibold", s === "A" && "justify-end")} style={{ fontSize: nameFs, gap: nameFs * 0.3, color: isServer ? LIME : undefined }}>
                {isServer && s === "B" && <ServeBall size={nameFs * 0.55} />}
                <span className="truncate">{pname(id)}</span>
                {isServer && s === "A" && <ServeBall size={nameFs * 0.55} />}
              </div>
            );
          }) : <div className="font-semibold text-white/60" style={{ fontSize: nameFs }}>Lineup TBD</div>}
        </div>
        {done && m.winner === s && <Check className="shrink-0 text-[#C6FF00]" style={{ width: nameFs, height: nameFs }} strokeWidth={3} aria-label="won" />}
      </div>
    );
  };

  return (
    <div
      className={cn("relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center overflow-hidden rounded-[0.8vmin]", live ? "bg-[#FF3B5C]/[0.09]" : "bg-white/[0.035]")}
      style={{ paddingInline: nameFs * 0.8, columnGap: nameFs * 0.9, boxShadow: live ? `inset 0 0 0 1px ${LIVE}55` : "inset 0 0 0 1px rgba(255,255,255,.05)" }}
    >
      {live && <span aria-hidden className="absolute inset-y-0 left-0" style={{ width: Math.max(3, h * 0.05), background: LIVE }} />}
      {side(m.lineupA, A, "A")}
      <div className={cn("flex items-center justify-center", compact ? "flex-row" : "flex-col")} style={{ minWidth: scoreFs * 2.4, gap: compact ? smallFs * 0.6 : 0 }}>
        <div className={cn("flex items-center whitespace-nowrap", compact && "flex-col items-start leading-none")} style={{ gap: compact ? smallFs * 0.2 : smallFs * 0.5 }}>
          <span className="rounded px-[0.4em] font-display font-bold uppercase tracking-wider" style={{ fontSize: smallFs, background: `${cat?.color}2E`, color: cat?.color, boxShadow: `inset 0 0 0 1px ${cat?.color}66` }}>{cat?.code}</span>
          {m.court && <span className="font-display font-semibold uppercase tracking-wider text-white/75" style={{ fontSize: smallFs }}>{m.court}</span>}
          {live && <LivePip size={smallFs * 0.6} />}
          {!compact && <RowFlag m={m} live={live} fs={smallFs} />}
        </div>
        {live && m.live ? (
          <div className="flex items-baseline score-display" style={{ fontSize: scoreFs, gap: scoreFs * 0.14 }}>
            <AnimatedNumber value={m.live.score.a} />
            <span className="text-white/35" style={{ fontSize: scoreFs * 0.55 }}>-</span>
            <AnimatedNumber value={m.live.score.b} />
          </div>
        ) : done ? (
          <div className="flex items-center score-display" style={{ fontSize: scoreFs * 0.5, gap: scoreFs * 0.18 }}>
            {gamesDone.length ? gamesDone.map((g, i) => <span key={i}>{g.a}-{g.b}</span>) : <span className="uppercase">{m.status === "WALKOVER" ? "W/O" : "Ret."}</span>}
          </div>
        ) : (
          <div className="whitespace-nowrap font-display font-semibold uppercase tracking-wide text-white/75 tnum" style={{ fontSize: scoreFs * 0.42 }}>
            {m.isDecider ? "Decider · " : ""}{fmtTime(m.scheduledAt, tz)}
          </div>
        )}
      </div>
      {side(m.lineupB, B, "B")}
    </div>
  );
}

function RowFlag({ m, live, fs }: { m: MatchSummary; live: boolean; fs: number }) {
  if (!live || !m.live) return null;
  const prev = m.games.slice(0, -1).filter((g) => g.winner);
  const flag = m.status === "PAUSED" ? "Paused" : m.live.activeTimeout ? (m.live.activeTimeout.medical ? "Medical TO" : "Timeout") : m.live.matchPoint.length ? "Match point" : m.live.gamePoint.length ? "Game point" : null;
  return (
    <div className="flex items-center whitespace-nowrap" style={{ gap: fs * 0.4, fontSize: fs }}>
      <span className="font-display font-semibold uppercase tracking-wider text-white/70">G{m.games.length}{prev.length ? ` · ${prev.map((g) => `${g.a}-${g.b}`).join(" ")}` : ""}</span>
      {m.live.switchEndsAlert && <span className="inline-flex items-center gap-[0.3em] rounded bg-white px-[0.4em] font-display font-bold uppercase text-black"><ArrowLeftRight style={{ width: "1em", height: "1em" }} /> Switch</span>}
      {flag && <span className="rounded px-[0.4em] font-display font-bold uppercase text-black" style={{ background: flag === "Paused" || flag.includes("TO") || flag === "Timeout" ? "#FBBF24" : LIME }}>{flag}</span>}
    </div>
  );
}

function ServeBall({ size }: { size: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: LIME, boxShadow: `0 0 ${size}px ${LIME}` }} aria-label="serving" />;
}

/** Lower-third ticker: latest results and what's next. Static under reduced motion. */
function Ticker({ b, lk, L }: { b: TournamentBundle; lk: Lk; L: Layout }) {
  const reduce = useReducedMotion();
  const items = useMemo(() => {
    const code = (id: string | null) => lk.teams.get(id ?? "")?.code ?? "TBD";
    const results = b.ties
      .flatMap((t) => t.matches.map((m) => ({ t, m })))
      .filter(({ m }) => DONE.includes(m.status) && m.winner)
      .sort((x, y) => y.m.updatedAt.localeCompare(x.m.updatedAt))
      .slice(0, 10)
      .map(({ t, m }) => ({
        key: m.id,
        kind: "result" as const,
        text: `${code(t.teamAId)} v ${code(t.teamBId)}`,
        cat: lk.categories.get(m.categoryId),
        detail: m.games.filter((g) => g.winner).map((g) => `${g.a}-${g.b}`).join("  ") || m.status.toLowerCase(),
        winner: code(m.winner === "A" ? t.teamAId : t.teamBId),
      }));
    const ties = b.ties.filter((t) => t.status === "FINISHED").map((t) => ({ key: `tie-${t.id}`, kind: "tie" as const, text: `${code(t.teamAId)} ${t.scoreA}–${t.scoreB} ${code(t.teamBId)}`, cat: undefined, detail: t.winner === "DRAW" ? "Tie drawn" : "Tie final", winner: "" }));
    return [...ties, ...results];
  }, [b, lk]);
  if (!items.length) return <div className="shrink-0" style={{ height: L.tickerH * 0.35 }} />;
  const fs = L.tickerH * 0.4;
  const row = (
    <div className="flex shrink-0 items-center" style={{ gap: fs * 1.6, paddingRight: fs * 1.6 }}>
      {items.map((it) => (
        <span key={it.key} className="flex items-center whitespace-nowrap" style={{ gap: fs * 0.45 }}>
          {it.cat && <span className="rounded px-[0.35em] font-display font-bold uppercase" style={{ fontSize: fs * 0.8, background: `${it.cat.color}2E`, color: it.cat.color }}>{it.cat.code}</span>}
          <span className="font-display font-bold uppercase tracking-wide">{it.text}</span>
          <span className="font-display font-semibold text-white/75 tnum">{it.detail}</span>
          {it.winner && <span className="font-display font-bold uppercase text-[#C6FF00]">{it.winner} win</span>}
          <span className="text-white/30" aria-hidden>◆</span>
        </span>
      ))}
    </div>
  );
  return (
    <footer className="relative z-10 flex shrink-0 items-stretch overflow-hidden border-t border-white/10 bg-black/70" style={{ height: L.tickerH, fontSize: fs }} aria-label="Latest results">
      <span className="flex shrink-0 items-center font-display font-extrabold uppercase tracking-[0.18em] text-black" style={{ background: LIME, paddingInline: fs * 0.9 }}>Results</span>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[4vmin] bg-gradient-to-r from-black to-transparent" />
        {reduce ? (
          <div className="flex h-full items-center" style={{ paddingLeft: fs }}>{row}</div>
        ) : (
          <motion.div className="flex h-full w-max items-center" style={{ paddingLeft: fs }} animate={{ x: ["0%", "-50%"] }} transition={{ duration: Math.max(20, items.length * 5), ease: "linear", repeat: Infinity }}>
            {row}
            {row}
          </motion.div>
        )}
      </div>
    </footer>
  );
}
