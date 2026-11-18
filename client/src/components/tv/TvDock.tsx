import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronUp, LayoutGrid, Maximize, Minimize, RefreshCw, Repeat, Swords, Users } from "lucide-react";
import { cn, contrastText } from "@/lib/utils";
import { fmtTime } from "@/lib/format";
import type { DisplaySettings, PublicTeam, TieSummary, TournamentBundle } from "@shared/api";
import type { useLookups } from "@/hooks/useBundle";

type Lk = ReturnType<typeof useLookups>;
type Mode = DisplaySettings["mode"];
export interface TvSelection {
  mode: Mode;
  teamId?: string | null;
  tieId?: string | null;
}

const LIVE = "#FF3B5C";
const isLive = (t: TieSummary) => t.matches.some((m) => m.status === "LIVE" || m.status === "PAUSED");
const firstAt = (t: TieSummary) => Math.min(...t.matches.map((m) => (m.scheduledAt ? Date.parse(m.scheduledAt) : Infinity)));

/** Team record (ties W-D-L) from finished ties. */
export function teamRecord(b: TournamentBundle, teamId: string) {
  let w = 0, d = 0, l = 0;
  for (const t of b.ties) {
    if (t.status !== "FINISHED" || (t.teamAId !== teamId && t.teamBId !== teamId)) continue;
    const side = t.teamAId === teamId ? "A" : "B";
    if (t.winner === "DRAW") d++;
    else if (t.winner === side) w++;
    else l++;
  }
  return { w, d, l };
}

/**
 * Bottom control dock for the TV screen, operated from the laptop driving the TV.
 * Opens when the pointer reaches the bottom edge, when the visible handle is clicked, or with the M key
 * (never hover-only). Esc closes it. Selecting a view/team/tie applies immediately.
 */
export function TvDock({ b, lk, effective, overridden, forceOpenTab, onSelect, onFollowAdmin }: {
  b: TournamentBundle;
  lk: Lk;
  effective: TvSelection;
  overridden: boolean;
  /** When the current view needs a choice (e.g. TEAM with no valid team), open on that tab. */
  forceOpenTab?: "TEAM" | "TIE" | null;
  onSelect: (s: TvSelection) => void;
  onFollowAdmin: () => void;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"VIEWS" | "TEAM" | "TIE">(effective.mode === "TEAM" ? "TEAM" : effective.mode === "TIE" ? "TIE" : "VIEWS");
  const [handle, setHandle] = useState(true);
  const [fs, setFs] = useState(() => !!document.fullscreenElement);
  const closeTimer = useRef<number>();
  const idleTimer = useRef<number>();
  const dockRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const forcedRef = useRef(forceOpenTab);
  forcedRef.current = forceOpenTab;

  const wasForced = useRef(false);
  useEffect(() => {
    if (forceOpenTab) {
      setTab(forceOpenTab);
      setOpen(true);
      wasForced.current = true;
    } else if (wasForced.current) {
      // a valid choice was just made from the forced picker: get out of the way
      wasForced.current = false;
      window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => setOpen(false), 700);
    }
  }, [forceOpenTab]);

  // pointer near the bottom edge opens the dock; any movement shows the handle + cursor briefly
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setHandle(true);
      document.body.style.cursor = "";
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        setHandle(false);
        if (!dockRef.current?.matches(":hover")) document.body.style.cursor = "none";
      }, 3000);
      // Open/close follows where the pointer really moves (not enter/leave events, which also fire while the
      // dock slides under a resting pointer): near the bottom edge or over the dock keeps it open; moving up away closes it.
      const nearBottom = e.clientY > window.innerHeight - Math.max(90, window.innerHeight * 0.12);
      const dockTop = dockRef.current?.getBoundingClientRect().top ?? window.innerHeight;
      if (nearBottom || (openRef.current && e.clientY >= dockTop - 24)) {
        window.clearTimeout(closeTimer.current);
        if (nearBottom) setOpen(true);
      } else if (openRef.current && !forcedRef.current) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = window.setTimeout(() => setOpen(false), 700);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if ((e.key === "m" || e.key === "M") && !(e.target as HTMLElement)?.closest("input,textarea")) setOpen((o) => !o);
    };
    const onFs = () => setFs(!!document.fullscreenElement);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    idleTimer.current = window.setTimeout(() => setHandle(false), 4000);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      window.clearTimeout(idleTimer.current);
      document.body.style.cursor = "";
    };
  }, []);

  const scheduleClose = () => {
    if (forceOpenTab) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 700);
  };

  const ties = useMemo(() => {
    const ready = b.ties.filter((t) => t.teamAId && t.teamBId);
    const rank = (t: TieSummary) => (isLive(t) || t.status === "IN_PROGRESS" || t.status === "DECIDED" ? 0 : t.status === "SCHEDULED" ? 1 : 2);
    return [...ready].sort((x, y) => rank(x) - rank(y) || (rank(x) === 2 ? firstAt(y) - firstAt(x) : firstAt(x) - firstAt(y)));
  }, [b.ties]);
  const liveTeamIds = useMemo(() => new Set(b.ties.filter(isLive).flatMap((t) => [t.teamAId, t.teamBId])), [b.ties]);

  const pick = (s: TvSelection) => {
    onSelect(s);
    if (!forceOpenTab) scheduleClose();
  };

  const views: { mode: Mode; label: string; desc: string; icon: typeof LayoutGrid }[] = [
    { mode: "ALL", label: "All live ties", desc: "Every tie in progress", icon: LayoutGrid },
    { mode: "ROTATE", label: "Rotate", desc: "One live tie at a time", icon: Repeat },
  ];

  return (
    <>
      {/* bottom hot zone + handle (click/tap fallback, never hover-only) */}
      <AnimatePresence>
        {!open && handle && (
          <motion.button
            key="handle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(true)}
            style={{ bottom: "calc(max(40px, min(3.4vw, 6.04vh)) + 14px)" }}
            className="fixed left-1/2 z-40 flex -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-2xl backdrop-blur-xl hover:border-[#C6FF00]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6FF00]"
            aria-label="Open display controls (M)"
          >
            <ChevronUp className="h-4 w-4 text-[#C6FF00]" /> Choose what's on screen <kbd className="rounded border border-white/20 px-1.5 text-[11px] text-white/70">M</kbd>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="dock"
            ref={dockRef}
            role="dialog"
            aria-label="Display controls"
            initial={reduce ? { opacity: 0 } : { y: "105%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "105%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#07070A] text-white shadow-[0_-24px_60px_-12px_rgba(0,0,0,.9)] backdrop-blur-2xl"
            style={{ cursor: "default" }}
          >
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C6FF00]/60 to-transparent" />
            <div className="mx-auto flex max-w-[1800px] flex-col gap-3 px-5 pb-5 pt-3">
              {/* tabs row */}
              <div className="flex flex-wrap items-center gap-2">
                <div role="tablist" aria-label="Display type" className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
                  {([["VIEWS", "Views", LayoutGrid], ["TEAM", "One team", Users], ["TIE", "One tie", Swords]] as const).map(([k, label, Icon]) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                      className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6FF00]",
                        tab === k ? "bg-[#C6FF00] text-black" : "text-white/75 hover:bg-white/10 hover:text-white")}>
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
                <span className="ml-2 hidden text-sm text-white/60 md:inline">
                  Showing: <b className="text-white">{describe(effective, lk)}</b>{overridden ? " · this screen" : " · admin default"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {overridden && (
                    <button onClick={() => { onFollowAdmin(); scheduleClose(); }} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6FF00]">
                      <RefreshCw className="h-4 w-4" /> Follow admin
                    </button>
                  )}
                  <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6FF00]">
                    {fs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />} {fs ? "Exit full screen" : "Full screen"}
                  </button>
                  <button onClick={() => setOpen(false)} className="min-h-11 cursor-pointer rounded-lg px-3 text-sm text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6FF00]" aria-label="Close controls">Esc</button>
                </div>
              </div>

              {/* content row */}
              <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                {tab === "VIEWS" && (
                  <div className="flex gap-3">
                    {views.map((v) => {
                      const active = effective.mode === v.mode;
                      return (
                        <button key={v.mode} onClick={() => pick({ mode: v.mode })} aria-pressed={active}
                          className={cn("flex min-h-20 w-64 shrink-0 cursor-pointer items-center gap-3 rounded-2xl border p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6FF00]",
                            active ? "border-[#C6FF00] bg-[#C6FF00]/10 shadow-[0_0_0_1px_rgba(198,255,0,.4),0_0_24px_-6px_rgba(198,255,0,.5)]" : "border-white/10 bg-white/[0.03] hover:border-white/30")}>
                          <v.icon className={cn("h-7 w-7 shrink-0", active ? "text-[#C6FF00]" : "text-white/70")} />
                          <span><span className="block font-display text-xl font-bold uppercase tracking-wide">{v.label}</span><span className="text-sm text-white/60">{v.desc}</span></span>
                        </button>
                      );
                    })}
                    <button onClick={() => setTab("TEAM")} className="flex min-h-20 w-64 shrink-0 cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6FF00]">
                      <Users className="h-7 w-7 text-white/70" /><span><span className="block font-display text-xl font-bold uppercase tracking-wide">One team</span><span className="text-sm text-white/60">Pick a team →</span></span>
                    </button>
                    <button onClick={() => setTab("TIE")} className="flex min-h-20 w-64 shrink-0 cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6FF00]">
                      <Swords className="h-7 w-7 text-white/70" /><span><span className="block font-display text-xl font-bold uppercase tracking-wide">One tie</span><span className="text-sm text-white/60">Pick a tie →</span></span>
                    </button>
                  </div>
                )}

                {tab === "TEAM" && (
                  <div className="flex gap-3" role="listbox" aria-label="Teams">
                    {b.teams.map((t) => {
                      const active = effective.mode === "TEAM" && effective.teamId === t.id;
                      const r = teamRecord(b, t.id);
                      return (
                        <button key={t.id} role="option" aria-selected={active} onClick={() => pick({ mode: "TEAM", teamId: t.id })} data-testid={`dock-team-${t.code}`}
                          className={cn("relative flex w-60 shrink-0 cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition-[border-color,transform] duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6FF00]",
                            active ? "border-[#C6FF00] shadow-[0_0_0_1px_rgba(198,255,0,.4),0_0_24px_-6px_rgba(198,255,0,.5)]" : "border-white/10 hover:border-white/30")}
                          style={{ background: `linear-gradient(120deg, ${t.color}40, rgba(255,255,255,.02) 60%)` }}>
                          <TeamBadge team={t} size={52} />
                          <span className="min-w-0">
                            <span className="block truncate font-display text-xl font-bold uppercase leading-tight tracking-wide">{t.name}</span>
                            <span className="flex items-center gap-2 text-sm text-white/70 tnum">
                              {r.w}W{r.d ? ` ${r.d}D` : ""} {r.l}L
                              {liveTeamIds.has(t.id) && <span className="inline-flex items-center gap-1 font-bold uppercase text-[#FF6B85]"><span className="h-2 w-2 rounded-full" style={{ background: LIVE }} /> live</span>}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {tab === "TIE" && (
                  <div className="flex gap-3" role="listbox" aria-label="Ties">
                    {ties.map((t) => {
                      const A = lk.teams.get(t.teamAId!);
                      const B = lk.teams.get(t.teamBId!);
                      const active = effective.mode === "TIE" && effective.tieId === t.id;
                      const live = isLive(t);
                      const status = live ? "Live" : t.status === "FINISHED" ? (t.winner === "DRAW" ? "Final · draw" : "Final") : t.status === "SCHEDULED" ? fmtTime(t.matches[0]?.scheduledAt, b.tournament.timezone) : "In progress";
                      return (
                        <button key={t.id} role="option" aria-selected={active} onClick={() => pick({ mode: "TIE", tieId: t.id })} data-testid={`dock-tie-${A?.code}-${B?.code}`}
                          className={cn("relative w-64 shrink-0 cursor-pointer overflow-hidden rounded-2xl border p-3 text-left transition-[border-color,transform] duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6FF00]",
                            active ? "border-[#C6FF00] shadow-[0_0_0_1px_rgba(198,255,0,.4),0_0_24px_-6px_rgba(198,255,0,.5)]" : live ? "border-[#FF3B5C]/50" : "border-white/10 hover:border-white/30")}
                          style={{ background: `linear-gradient(90deg, ${A?.color}33, rgba(255,255,255,.02) 45%, rgba(255,255,255,.02) 55%, ${B?.color}33)` }}>
                          <span className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
                            <span className="truncate">{t.roundLabel}</span>
                            <span className={cn("flex shrink-0 items-center gap-1", live && "text-[#FF6B85]")}>{live && <span className="h-2 w-2 rounded-full" style={{ background: LIVE }} />}{status}</span>
                          </span>
                          <span className="mt-2 flex items-center justify-between gap-2">
                            <TeamBadge team={A} size={40} />
                            <span className="score-display text-4xl">{t.scoreA}<span className="mx-1 text-white/35">–</span>{t.scoreB}</span>
                            <TeamBadge team={B} size={40} />
                          </span>
                          <span className="mt-1 flex justify-between gap-2 text-xs font-semibold text-white/75"><span className="truncate">{A?.name}</span><span className="truncate text-right">{B?.name}</span></span>
                        </button>
                      );
                    })}
                    {!ties.length && <p className="p-4 text-white/60">No ties yet.</p>}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function TeamBadge({ team, size }: { team?: PublicTeam | null; size: number }) {
  if (team?.logoUrl) return <img src={team.logoUrl} alt="" className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />;
  const c = team?.color ?? "#444";
  return (
    <span className="grid shrink-0 place-items-center rounded-xl font-display font-extrabold shadow-[inset_0_-3px_0_rgba(0,0,0,.2)]" style={{ width: size, height: size, background: c, color: contrastText(c), fontSize: size * 0.36 }}>
      {team?.code ?? "?"}
    </span>
  );
}

function describe(s: TvSelection, lk: Lk) {
  if (s.mode === "TEAM") return lk.teams.get(s.teamId ?? "")?.name ?? "Pick a team";
  if (s.mode === "TIE") {
    const t = lk.ties.get(s.tieId ?? "");
    return t ? `${lk.teams.get(t.teamAId ?? "")?.code} v ${lk.teams.get(t.teamBId ?? "")?.code}` : "Pick a tie";
  }
  return s.mode === "ROTATE" ? "Rotating live ties" : "All live ties";
}

