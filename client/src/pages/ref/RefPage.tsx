import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, ArrowLeftRight, CheckCircle2, Clock, Flag, HeartPulse, Loader2, Lock, MoreHorizontal, RotateCcw, ShieldX, Trophy, Undo2, Volume2, VolumeX, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CourtDiagram } from "@/components/match/CourtDiagram";
import { PlayerSearch } from "@/components/match/PlayerSearch";
import { FormatPicker } from "@/components/match/FormatPicker";
import { NativeSelect } from "@/components/ui/input";
import { AnimatedNumber, CategoryBadge, TeamChip } from "@/components/match/bits";
import { api, errorMessage } from "@/lib/api";
import { beep, useWakeLock, vibrate } from "@/lib/feedback";
import { cn, contrastText } from "@/lib/utils";
import { previewRally } from "@shared/scoring/engine";
import type { EngineEvent, MatchState, Side } from "@shared/scoring/types";
import type { PublicPlayer, PublicTeam, RefBundle } from "@shared/api";
import { useRefMatch } from "./useRefMatch";

const other = (s: Side): Side => (s === "A" ? "B" : "A");

export default function RefPage() {
  const { matchId = "" } = useParams();
  const [params] = useSearchParams();
  const token = useMemo(() => {
    const t = params.get("token");
    try {
      if (t) sessionStorage.setItem(`pl-ref-${matchId}`, t);
      return t ?? sessionStorage.getItem(`pl-ref-${matchId}`) ?? "";
    } catch {
      return t ?? "";
    }
  }, [params, matchId]);
  const r = useRefMatch(matchId, token);
  useWakeLock(true);

  useEffect(() => {
    document.title = "Referee · PickleLive";
  }, []);

  if (r.revoked && r.sessionMode)
    return (
      <Center>
        <ShieldX className="h-14 w-14 text-amber-500" />
        <h1 className="text-2xl font-black">Referee sign-in needed</h1>
        <p className="max-w-xs text-muted-foreground">Sign in with the referee login to score this match.</p>
        <Button asChild size="lg"><Link to="/ref">Referee sign-in</Link></Button>
      </Center>
    );
  if (r.revoked)
    return (
      <Center>
        <ShieldX className="h-14 w-14 text-destructive" />
        <h1 className="text-2xl font-black">Referee link revoked</h1>
        <p className="max-w-xs text-muted-foreground">This link is no longer valid. Ask the tournament admin for a new referee link or QR code.</p>
      </Center>
    );
  if (r.loadError) return <Center><AlertTriangle className="h-10 w-10 text-amber-500" /><p>{r.loadError}</p><Button onClick={() => r.load()}>Retry</Button></Center>;
  if (!r.bundle || !r.state) return <Center><Loader2 className="h-8 w-8 animate-spin" /><p className="text-muted-foreground">Loading match…</p></Center>;

  const b = r.bundle;
  const st = r.state;
  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)]">
      {(!r.netOk || r.queue.length > 0) && (
        <div role="status" className={cn("sticky top-0 z-40 flex items-center justify-center gap-2 px-3 py-2 text-sm font-bold", r.netOk ? "bg-amber-500 text-black" : "bg-live text-white")}>
          <WifiOff className="h-4 w-4" />
          {r.netOk ? `Syncing ${r.queue.length} event${r.queue.length === 1 ? "" : "s"}…` : `Offline – ${r.queue.length} event${r.queue.length === 1 ? "" : "s"} queued`}
        </div>
      )}
      {r.sessionMode && (
        <div className="flex items-center justify-between border-b bg-card/60 px-3 py-1.5 text-sm">
          <Link to={`/ref?t=${b.tournament.id}`} className="inline-flex min-h-10 items-center gap-1 font-semibold text-muted-foreground hover:text-foreground" data-testid="back-to-matches">
            <ArrowLeft className="h-4 w-4" /> Choose another match
          </Link>
          <span className="text-xs text-muted-foreground">Referee login</span>
        </div>
      )}
      {st.phase === "NOT_STARTED" ? (
        <Wizard r={r} b={b} />
      ) : st.phase === "FINISHED" ? (
        <Finished r={r} b={b} st={st} />
      ) : (
        <Live r={r} b={b} st={st} />
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>;
}

type R = ReturnType<typeof useRefMatch>;

function Header({ b, st }: { b: RefBundle; st?: MatchState }) {
  const tie = b.tie;
  return (
    <header className="flex items-center gap-2 border-b px-3 py-2 text-sm">
      <CategoryBadge category={b.category} />
      <span className="truncate font-semibold">{b.category.name}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2 text-muted-foreground">
        {b.match.court && <span>{b.match.court}</span>}
        <span className="flex items-center gap-1 font-bold text-foreground tnum">
          <TeamChip team={b.teamA} size="sm" /> {tie.scoreA}–{tie.scoreB} <TeamChip team={b.teamB} size="sm" />
        </span>
      </span>
      {st && st.games.length > 0 && null}
    </header>
  );
}

// ------------------------------------------------------------------ setup (one simple screen)

/**
 * Pre-match setup on ONE screen, in plain language for non-technical referees:
 * 1) who is playing (dropdowns), 2) who serves first (two big buttons), 3) where they stand (mini court with swap
 * buttons). Court and format are prefilled. START saves lineups, locks them and begins the match in one tap.
 */
function Wizard({ r, b }: { r: R; b: RefBundle }) {
  const doubles = b.config.format === "DOUBLES";
  const need = doubles ? 2 : 1;
  const info = (s: Side) => b.lineups.teams.find((t) => t.side === s);
  const team = (s: Side) => (s === "A" ? b.teamA : b.teamB);
  const players = useMemo(() => new Map(b.players.map((p) => [p.id, p])), [b.players]);
  // Nothing prefilled: the referee picks every player (only an already-locked lineup is shown as is).
  const [sel, setSel] = useState<{ A: string[]; B: string[] }>(() => ({ A: info("A")?.locked ? info("A")!.playerIds : [], B: info("B")?.locked ? info("B")!.playerIds : [] }));
  const [server, setServer] = useState<Side | null>(null);
  const [leftTeam, setLeftTeam] = useState<Side>("A");
  const [firstIsRight, setFirstIsRight] = useState<{ A: boolean; B: boolean }>({ A: true, B: true });
  const [court, setCourt] = useState(b.match.court ?? "");
  const [showFormat, setShowFormat] = useState(false);
  const [working, setWorking] = useState(false);

  const picked = (s: Side) => sel[s].filter(Boolean);
  const complete = (s: Side) => picked(s).length === need && new Set(picked(s)).size === need;
  const missing = [
    !complete("A") && `${team("A")?.code} players`,
    !complete("B") && `${team("B")?.code} players`,
    !server && "who serves first",
    !court && "court",
  ].filter(Boolean) as string[];
  const name = (id?: string) => (id ? players.get(id)?.name ?? "?" : "—");
  const rightOf = (s: Side) => (doubles ? (firstIsRight[s] ? picked(s)[0] : picked(s)[1]) : picked(s)[0]);
  const leftOf = (s: Side) => (doubles ? (firstIsRight[s] ? picked(s)[1] : picked(s)[0]) : undefined);

  const start = async () => {
    if (missing.length || !server) return;
    setWorking(true);
    try {
      if (court !== b.match.court) await api.put(`/api/ref/${b.match.id}/court`, { court }, r.headers);
      for (const s of ["A", "B"] as Side[]) {
        const i = info(s)!;
        const ids = picked(s);
        if (!i.locked && (!i.submitted || ids.join() !== i.playerIds.join())) await api.put(`/api/ref/${b.match.id}/lineup`, { teamId: i.teamId, playerIds: ids }, r.headers);
      }
      if (!info("A")?.locked || !info("B")?.locked) await api.post(`/api/ref/${b.match.id}/lineups/lock`, {}, r.headers);
      const fresh = await r.load();
      if (!fresh) return;
      const ok = r.send({
        type: "SETUP",
        payload: {
          firstServingTeam: server,
          positions: { A: { right: rightOf("A")!, left: leftOf("A") ?? null }, B: { right: rightOf("B")!, left: leftOf("B") ?? null } },
          teamAEnd: leftTeam === "A" ? "NEAR" : "FAR",
        },
      });
      if (ok) vibrate([30, 40, 30]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setWorking(false);
    }
  };

  const rightTeam: Side = leftTeam === "A" ? "B" : "A";
  // Team on the left faces right → its right court is the bottom box; team on the right → its right court is the top box.
  const box = (s: Side, onLeft: boolean) => {
    const t = team(s);
    const color = t?.color ?? "#444";
    const rows = onLeft ? [leftOf(s), rightOf(s)] : [rightOf(s), leftOf(s)];
    const courts = onLeft ? ["L", "R"] : ["R", "L"];
    return (
      <div className="grid grid-rows-2" style={{ background: `${color}2E` }}>
        {rows.map((id, i) => (
          <div key={i} className={cn("relative flex min-h-16 items-center justify-center p-2 text-center", i === 0 && "border-b-2 border-white/50")}>
            {(doubles || courts[i] === "R") && (
              <span className={cn("rounded-lg px-2 py-1 text-sm font-bold", server === s && courts[i] === "R" && "ring-4 ring-lime")} style={{ background: color, color: contrastText(color) }}>
                {name(id)}
              </span>
            )}
            <span className={cn("absolute bottom-1 text-[10px] font-black text-white/50", onLeft ? "left-1.5" : "right-1.5")}>{courts[i] === "R" ? "RIGHT" : "LEFT"}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-xl pb-40">
      <Header b={b} />
      <div className="space-y-6 p-4">
        {b.busy && (
          <div role="alert" className="flex gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm font-semibold text-amber-600 dark:text-amber-300" data-testid="busy-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{b.busy}</span>
          </div>
        )}

        <SetupStep n={1} title="Who is playing?">
          <div className="grid gap-3">
            {(["A", "B"] as Side[]).map((s) => {
              const i = info(s);
              if (!i) return null;
              return (
                <section key={s} className="rounded-2xl border p-3" aria-label={`${team(s)?.name} players`}>
                  <div className="mb-2 flex items-center gap-2 font-semibold"><TeamChip team={team(s)} /> {team(s)?.name}{i.locked && <Lock className="ml-auto h-4 w-4 text-muted-foreground" aria-label="locked" />}</div>
                  {i.locked ? (
                    <p className="text-lg font-bold">{i.playerIds.map((id) => name(id)).join(" & ")}</p>
                  ) : (
                    <PlayerSearch roster={i.roster} category={b.category} value={sel[s]} onChange={(ids) => setSel((x) => ({ ...x, [s]: ids }))} teamCode={team(s)?.code} />
                  )}
                </section>
              );
            })}
          </div>
        </SetupStep>

        <SetupStep n={2} title="Who serves first?">
          <TwoTeams b={b} value={server} onChange={setServer} />
          <p className="mt-2 text-sm text-muted-foreground">Toss winner chooses. The first server starts from the <b>right</b> court.</p>
        </SetupStep>

        <SetupStep n={3} title="Where are they standing?">
          <p className="mb-2 text-sm text-muted-foreground">As you see the court from your chair at the net.</p>
          <div className="grid grid-cols-[1fr_10px_1fr] overflow-hidden rounded-xl border-4 border-white/80 bg-[#1e3a8a]" data-testid="setup-court">
            {box(leftTeam, true)}
            <div className="bg-white/90" aria-hidden />
            {box(rightTeam, false)}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12" onClick={() => setLeftTeam(rightTeam)}><ArrowLeftRight /> Swap sides</Button>
            {doubles ? (
              <div className="grid grid-cols-2 gap-2">
                {(["A", "B"] as Side[]).map((s) => (
                  <Button key={s} variant="outline" className="h-12 px-2" disabled={picked(s).length < 2} onClick={() => setFirstIsRight((x) => ({ ...x, [s]: !x[s] }))} aria-label={`Swap ${team(s)?.name} players`}>
                    <ArrowLeftRight /> {team(s)?.code}
                  </Button>
                ))}
              </div>
            ) : <span />}
          </div>
        </SetupStep>

        <section className="space-y-3 rounded-2xl border p-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="w-16 font-semibold">Court</span>
            {b.match.court ? <span className="flex-1 text-base font-bold" data-testid="court-chosen">{b.match.court}</span> : <NativeSelect value={court} onChange={(e) => setCourt(e.target.value)} className="h-12 flex-1" data-testid="court-select" aria-label="Court">
              <option value="" disabled>Select court…</option>
              {b.tournament.courtNames.map((c) => <option key={c} value={c}>{c}</option>)}
            </NativeSelect>}
          </div>
          <div className="flex items-center gap-3">
            <span className="w-16 font-semibold">Format</span>
            <span className="flex-1">{b.config.bestOf === 1 ? "1 game" : `Best of ${b.config.bestOf} games`} to {b.config.pointsToWin} · {b.config.scoringType === "RALLY" ? "rally" : "side-out"} scoring</span>
            <Button variant="ghost" size="sm" onClick={() => setShowFormat((v) => !v)}>{showFormat ? "Done" : "Change"}</Button>
          </div>
          {showFormat && <FormatPicker matchId={b.match.id} bestOf={b.config.bestOf} pointsToWin={b.config.pointsToWin} scoringType={b.config.scoringType} headers={r.headers} onSaved={() => r.load()} compact />}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-xl">
          <Button size="lg" className="h-20 w-full text-2xl font-black" onClick={start} disabled={working || missing.length > 0 || !!b.busy} data-testid="start-match">
            {working && <Loader2 className="animate-spin" />} START MATCH
          </Button>
          <p className="mt-1 text-center text-sm text-muted-foreground" aria-live="polite">
            {b.busy ? "Waiting for the other tie to finish" : missing.length ? `Still needed: ${missing.join(", ")}` : `${team(server!)?.name} serves first · call "${b.config.scoringType === "SIDE_OUT" && doubles ? "0-0-2" : "0-0"}"`}
          </p>
        </div>
      </div>
    </div>
  );
}

function SetupStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-lime text-base text-black">{n}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function BigChoice({ active, onClick, children, style }: { active?: boolean; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={style}
      className={cn("min-h-20 rounded-xl border-2 p-3 text-base font-bold transition-colors", active ? "border-lime bg-lime/10" : "border-border hover:bg-accent")}>
      {children}
    </button>
  );
}

function TwoTeams({ b, value, onChange }: { b: RefBundle; value: Side | null; onChange: (s: Side) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["A", "B"] as Side[]).map((s) => {
        const t = s === "A" ? b.teamA : b.teamB;
        return (
          <BigChoice key={s} active={value === s} onClick={() => onChange(s)}>
            <span className="flex flex-col items-center gap-1" data-testid={`serve-${s}`}><TeamChip team={t} size="lg" /> <span className="text-sm">{t?.name}</span></span>
          </BigChoice>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ live

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function soundPref(b: RefBundle) {
  try {
    const v = localStorage.getItem("pl-sound");
    if (v != null) return v === "1";
  } catch {
    /* ignore */
  }
  return b.tournament.settings.soundsEnabled;
}

function Live({ r, b, st }: { r: R; b: RefBundle; st: MatchState }) {
  const [confirm, setConfirm] = useState<{ winner: Side; endsMatch: boolean } | null>(null);
  const [more, setMore] = useState(false);
  const [sound, setSound] = useState(() => soundPref(b));
  const players = useMemo(() => new Map<string, PublicPlayer>(b.players.map((p) => [p.id, p])), [b.players]);
  const team = (s: Side) => (s === "A" ? b.teamA : b.teamB);
  const g = st.games[st.gameIndex];
  const now = useNow(!!st.activeTimeout);

  const act = (ev: EngineEvent, label: string, kind: "point" | "sideout" | "game" | "undo" = "point") => {
    if (!r.send(ev)) return;
    vibrate(kind === "game" ? [40, 60, 40] : 25);
    if (sound) beep(kind);
    if (ev.type !== "UNDO") {
      toast(label, {
        duration: 3000,
        action: { label: "Undo", onClick: () => r.send({ type: "UNDO" }) },
      });
    }
  };

  const rally = (winner: Side) => {
    const p = previewRally(st, winner);
    if (p.endsGame) return setConfirm({ winner, endsMatch: p.endsMatch });
    const isPoint = st.config.scoringType === "RALLY" || st.servingTeam === winner;
    act({ type: "RALLY", payload: { winner } }, `${team(winner)?.code} won rally${isPoint ? " · point" : st.serverNumber === 1 ? " · 2nd server" : " · side out"}`, isPoint ? "point" : "sideout");
  };

  const timeoutLeft = st.activeTimeout?.startedAt ? Math.max(0, Math.ceil(st.activeTimeout.seconds - (now - new Date(st.activeTimeout.startedAt).getTime()) / 1000)) : null;
  // "NEAR" end = the team drawn on the LEFT of the court diagram; its button sits on the left too.
  const nearSide: Side = st.ends.A === "NEAR" ? "A" : "B";
  const farSide = other(nearSide);
  const flags = [...new Set([...st.matchPoint.map((s) => `MATCH POINT ${team(s)?.code}`), ...st.gamePoint.filter((s) => !st.matchPoint.includes(s)).map((s) => `GAME POINT ${team(s)?.code}`)])];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-bottom))] max-w-3xl flex-col landscape:max-w-none">
      <Header b={b} st={st} />
      {/* score strip */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-semibold">{st.config.bestOf === 1 ? `1 game to ${st.config.pointsToWin}` : `Game ${st.gameIndex + 1} of ${st.config.bestOf}`}</span>
        <span className="flex gap-2 tnum">
          {st.games.slice(0, st.gameIndex).map((x, i) => <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-bold text-foreground">{x.a}-{x.b}</span>)}
        </span>
        <span className="font-semibold">Games {st.gamesWon.A}-{st.gamesWon.B}</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-3 landscape:grid landscape:grid-cols-[1fr_1.4fr_1fr] landscape:items-stretch">
        <RallyButton team={team(nearSide)} side={nearSide} onClick={() => rally(nearSide)} serving={st.servingTeam === nearSide} className="hidden landscape:flex" />
        {/* call + court */}
        <div className="text-center">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Score call</div>
          <div className="score text-7xl font-black leading-none tracking-tight sm:text-8xl" aria-live="polite" data-testid="score-call">
            <AnimatedNumber value={st.call} />
          </div>
          <div className="mt-1 flex min-h-7 flex-wrap items-center justify-center gap-2">
            {flags.map((f) => <span key={f} className="rounded-md bg-lime px-2 py-0.5 text-xs font-black text-black">{f}</span>)}
            {st.phase === "BETWEEN_GAMES" && <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-bold">Game {st.gameIndex} done · next game starts</span>}
          </div>
          <div className="mt-1 text-sm text-muted-foreground tnum">
            {team("A")?.code} {g.a} – {g.b} {team("B")?.code}
          </div>
          <CourtDiagram state={st} teamA={b.teamA} teamB={b.teamB} players={players} className="mt-3" />
        </div>
        <RallyButton team={team(farSide)} side={farSide} onClick={() => rally(farSide)} serving={st.servingTeam === farSide} className="hidden landscape:flex" />
        {/* portrait: each team's button sits directly under its column of the court */}
        <div className="grid grid-cols-2 gap-3 landscape:hidden">
          <RallyButton team={team(nearSide)} side={nearSide} onClick={() => rally(nearSide)} serving={st.servingTeam === nearSide} />
          <RallyButton team={team(farSide)} side={farSide} onClick={() => rally(farSide)} serving={st.servingTeam === farSide} />
        </div>
      </div>

      <div className="sticky bottom-0 mt-3 grid grid-cols-[1fr_auto] gap-2 border-t bg-background/95 p-3 backdrop-blur">
        <Button size="lg" variant="secondary" className="h-16 text-lg font-black" onClick={() => act({ type: "UNDO" }, "Undone", "undo")} disabled={r.events.length === 0} data-testid="undo">
          <Undo2 className="!h-6 !w-6" /> UNDO
        </Button>
        <Button size="lg" variant="outline" className="h-16 w-16" aria-label="More actions" onClick={() => setMore(true)}>
          <MoreHorizontal className="!h-6 !w-6" />
        </Button>
        <div className="col-span-2 grid grid-cols-2 gap-2">
          {(["A", "B"] as Side[]).map((s) => (
            <Button key={s} variant="outline" className="h-12" onClick={() => act({ type: "TIMEOUT", payload: { team: s } }, `Timeout ${team(s)?.code}`)} disabled={st.timeoutsUsed[s] >= st.config.timeoutsPerGame}>
              <Clock /> Timeout {team(s)?.code} · {st.config.timeoutsPerGame - st.timeoutsUsed[s]} left
            </Button>
          ))}
        </div>
      </div>

      {/* switch ends banner */}
      <AnimatePresence>
        {st.switchEndsAlert && (
          <motion.div initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }} className="fixed inset-x-3 top-3 z-50 flex items-center justify-center gap-3 rounded-2xl bg-lime p-4 text-2xl font-black text-black shadow-2xl" role="alert">
            <ArrowLeftRight className="h-8 w-8" /> SWITCH ENDS
          </motion.div>
        )}
      </AnimatePresence>

      {/* timeout overlay */}
      {st.activeTimeout && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/90 p-6 text-center text-white" role="dialog" aria-label="Timeout">
          <div className="text-sm font-bold uppercase tracking-[0.3em] text-lime">{st.activeTimeout.medical ? "Medical timeout" : "Timeout"} · {team(st.activeTimeout.team)?.name}</div>
          <div className="score text-9xl font-black tnum">{timeoutLeft != null ? `${Math.floor(timeoutLeft / 60)}:${String(timeoutLeft % 60).padStart(2, "0")}` : "—"}</div>
          {timeoutLeft === 0 && <div className="text-xl font-bold text-live">Time!</div>}
          <Button size="lg" className="h-16 w-64 text-lg" onClick={() => r.send({ type: "TIMEOUT_END" })}>Resume play</Button>
          <Button variant="ghost" className="text-white" onClick={() => r.send({ type: "UNDO" })}>Undo timeout</Button>
        </div>
      )}

      {/* confirm game/match end */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        {confirm && (
          <DialogContent title={confirm.endsMatch ? "Match point – confirm" : "Game point – confirm"} description={`${team(confirm.winner)?.name} wins the rally and ${confirm.endsMatch ? "the MATCH" : `game ${st.gameIndex + 1}`}.`}>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button size="lg" onClick={() => {
                const w = confirm.winner;
                setConfirm(null);
                act({ type: "RALLY", payload: { winner: w } }, `${team(w)?.code} wins ${confirm.endsMatch ? "the match" : "the game"}`, "game");
              }} data-testid="confirm-end">
                <Trophy /> Confirm
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <MoreActions open={more} onClose={() => setMore(false)} b={b} st={st} act={act} sound={sound} setSound={(v) => {
        setSound(v);
        try { localStorage.setItem("pl-sound", v ? "1" : "0"); } catch { /* ignore */ }
      }} />
    </div>
  );
}

function RallyButton({ team, side, onClick, serving, className }: { team: PublicTeam | null; side: Side; onClick: () => void; serving: boolean; className?: string }) {
  const color = team?.color ?? "#3F3F46";
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      type="button"
      onClick={onClick}
      data-testid={`rally-${side}`}
      className={cn("relative flex min-h-32 flex-col items-center justify-center rounded-2xl p-3 text-center shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-ring landscape:min-h-40", className)}
      style={{ background: color, color: contrastText(color) }}
    >
      {serving && <span className="absolute right-2 top-2 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">Serving</span>}
      <span className="text-3xl font-black tracking-wider">{team?.code}</span>
      <span className="text-lg font-black uppercase">Won rally</span>
    </motion.button>
  );
}

function MoreActions({ open, onClose, b, st, act, sound, setSound }: {
  open: boolean; onClose: () => void; b: RefBundle; st: MatchState; act: (ev: EngineEvent, label: string) => void; sound: boolean; setSound: (v: boolean) => void;
}) {
  const [mode, setMode] = useState<null | "medical" | "warning" | "endgame" | "retire" | "positions">(null);
  const team = (s: Side) => (s === "A" ? b.teamA : b.teamB);
  const pname = (id: string | null) => b.players.find((p) => p.id === id)?.name ?? "";
  const close = () => {
    setMode(null);
    onClose();
  };
  const ids = (s: Side) => [st.positions[s].right, st.positions[s].left].filter(Boolean) as string[];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent title="Match actions">
        {!mode && (
          <div className="grid gap-2">
            <Button variant="outline" size="lg" className="justify-start" onClick={() => setMode("medical")}><HeartPulse /> Medical timeout</Button>
            <Button variant="outline" size="lg" className="justify-start" onClick={() => setMode("warning")}><AlertTriangle /> Warning / technical foul / fault</Button>
            {st.rallyInGame === 0 && st.config.format === "DOUBLES" && <Button variant="outline" size="lg" className="justify-start" onClick={() => setMode("positions")}><ArrowLeftRight /> Change starting positions</Button>}
            <Button variant="outline" size="lg" className="justify-start" onClick={() => setMode("endgame")}><Flag /> End game manually</Button>
            <Button variant="outline" size="lg" className="justify-start text-destructive" onClick={() => setMode("retire")}><RotateCcw /> Retire / forfeit</Button>
            <Button variant="ghost" size="lg" className="justify-start" onClick={() => setSound(!sound)}>{sound ? <Volume2 /> : <VolumeX />} Sounds {sound ? "on" : "off"}</Button>
          </div>
        )}
        {mode === "medical" && (
          <div className="grid gap-2">
            {(["A", "B"] as Side[]).flatMap((s) => ids(s).map((id) => (
              <Button key={id} variant="outline" size="lg" disabled={st.medicalUsed.includes(id)} onClick={() => { act({ type: "MEDICAL_TIMEOUT", payload: { team: s, playerId: id } }, `Medical TO ${pname(id)}`); close(); }}>
                {team(s)?.code} · {pname(id)} {st.medicalUsed.includes(id) && "(used)"}
              </Button>
            )))}
          </div>
        )}
        {mode === "warning" && (
          <div className="grid grid-cols-1 gap-2">
            {(["A", "B"] as Side[]).map((s) => (
              <div key={s} className="grid grid-cols-3 gap-2">
                {(["WARNING", "TECHNICAL_FOUL", "FAULT"] as const).map((k) => (
                  <Button key={k} variant="outline" className="h-14 whitespace-normal text-xs" onClick={() => { act({ type: "WARNING", payload: { team: s, kind: k } }, `${k.replace("_", " ").toLowerCase()} · ${team(s)?.code}`); close(); }}>
                    {team(s)?.code} {k === "TECHNICAL_FOUL" ? "Technical" : k === "FAULT" ? "Fault" : "Warning"}
                  </Button>
                ))}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Warnings and technical fouls are recorded in the match log.</p>
          </div>
        )}
        {mode === "positions" && (
          <div className="grid gap-2">
            {(["A", "B"] as Side[]).map((s) => (
              <Button key={s} variant="outline" size="lg" onClick={() => { const p = st.positions[s]; act({ type: "SET_POSITIONS", payload: { team: s, positions: { right: p.left!, left: p.right } } }, `${team(s)?.code} swapped`); close(); }}>
                Swap {team(s)?.code}: {pname(st.positions[s].right)} ⇄ {pname(st.positions[s].left)}
              </Button>
            ))}
          </div>
        )}
        {mode === "endgame" && (
          <div className="grid grid-cols-2 gap-2">
            <p className="col-span-2 text-sm text-muted-foreground">Award game {st.gameIndex + 1} at the current score to:</p>
            {(["A", "B"] as Side[]).map((s) => <Button key={s} size="lg" variant="outline" onClick={() => { act({ type: "END_GAME", payload: { winner: s } }, `Game to ${team(s)?.code}`); close(); }}>{team(s)?.name}</Button>)}
          </div>
        )}
        {mode === "retire" && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">The other team wins the match. This can be undone.</p>
            {(["A", "B"] as Side[]).map((s) => (
              <div key={s} className="grid grid-cols-2 gap-2">
                <Button variant="destructive" onClick={() => { act({ type: "RETIRE", payload: { team: s } }, `${team(s)?.code} retired`); close(); }}>{team(s)?.code} retires</Button>
                <Button variant="outline" onClick={() => { act({ type: "FORFEIT", payload: { team: s } }, `${team(s)?.code} forfeits`); close(); }}>{team(s)?.code} forfeits</Button>
              </div>
            ))}
          </div>
        )}
        {mode && <Button variant="ghost" onClick={() => setMode(null)}>Back</Button>}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ finished

function Finished({ r, b, st }: { r: R; b: RefBundle; st: MatchState }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(b.refSubmitted);
  const winner = st.winner ? (st.winner === "A" ? b.teamA : b.teamB) : null;
  return (
    <div className="mx-auto max-w-xl">
      <Header b={b} />
      <div className="space-y-4 p-4 text-center">
        <Trophy className="mx-auto h-14 w-14 text-lime-accent" />
        <h1 className="text-3xl font-black">{winner?.name} win</h1>
        {st.resultType && st.resultType !== "NORMAL" && <p className="font-semibold text-muted-foreground">({st.resultType.toLowerCase()})</p>}
        <div className="flex justify-center gap-2 text-2xl font-black tnum">
          {st.games.filter((g) => g.winner || g.a + g.b > 0).map((g, i) => <span key={i} className="rounded-lg bg-muted px-3 py-1">{g.a}-{g.b}</span>)}
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Stat label="Rallies" value={st.stats.totalRallies} />
          <Stat label="Side outs" value={st.stats.sideOuts} />
          <Stat label="Lead changes" value={st.stats.leadChanges} />
          <Stat label={`Best run ${b.teamA?.code}`} value={st.stats.A.longestRun} />
          <Stat label={`Best run ${b.teamB?.code}`} value={st.stats.B.longestRun} />
          <Stat label="Tie score" value={`${b.tie.scoreA}-${b.tie.scoreB}`} />
        </div>
        {done ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-lime/10 p-4 font-bold text-lime-accent"><CheckCircle2 /> Final submitted. Thank you, ref!</p>
        ) : (
          <Button size="lg" className="h-16 w-full text-lg" disabled={busy || r.queue.length > 0} onClick={async () => {
            setBusy(true);
            try {
              await api.post(`/api/ref/${b.match.id}/submit`, {}, r.headers);
              setDone(true);
              toast.success("Final submitted");
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}>
            <CheckCircle2 /> Submit final
          </Button>
        )}
        <Button variant="outline" size="lg" className="w-full" onClick={() => r.send({ type: "UNDO" })} data-testid="undo-finished"><Undo2 /> Undo last rally</Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xl font-black tnum">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
