import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeftRight, CheckCircle2, Clock, Flag, HeartPulse, Loader2, Lock, MoreHorizontal, RotateCcw, ShieldX, Trophy, Undo2, Volume2, VolumeX, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CourtDiagram } from "@/components/match/CourtDiagram";
import { slotSize } from "@/components/match/LineupPicker";
import { LineupSelects } from "@/components/match/LineupSelects";
import { NativeSelect } from "@/components/ui/input";
import { AnimatedNumber, CategoryBadge, TeamChip } from "@/components/match/bits";
import { api, errorMessage } from "@/lib/api";
import { beep, useWakeLock, vibrate } from "@/lib/feedback";
import { cn, contrastText } from "@/lib/utils";
import { previewRally } from "@shared/scoring/engine";
import type { EngineEvent, MatchState, Side, TeamPositions } from "@shared/scoring/types";
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

// ------------------------------------------------------------------ wizard

function Wizard({ r, b }: { r: R; b: RefBundle }) {
  const [step, setStep] = useState(0);
  const [tossWinner, setTossWinner] = useState<Side | null>(null);
  const [tossChoice, setTossChoice] = useState<"SERVE" | "RECEIVE" | "END" | null>(null);
  const [firstServer, setFirstServer] = useState<Side | null>(null);
  const [nearTeam, setNearTeam] = useState<Side>("A");
  const lineupA = b.lineups.teams.find((t) => t.side === "A");
  const lineupB = b.lineups.teams.find((t) => t.side === "B");
  const [pos, setPos] = useState<{ A: TeamPositions; B: TeamPositions } | null>(null);
  const players = new Map(b.players.map((p) => [p.id, p]));
  const bothIn = !!lineupA?.submitted && !!lineupB?.submitted;

  useEffect(() => {
    if (lineupA?.submitted && lineupB?.submitted) {
      const mk = (ids: string[]) => ({ right: ids[0], left: ids[1] ?? null });
      setPos((p) => p ?? { A: mk(lineupA.playerIds), B: mk(lineupB.playerIds) });
    }
  }, [lineupA, lineupB]);

  const serving: Side | null = tossChoice === "SERVE" ? tossWinner : tossChoice === "RECEIVE" && tossWinner ? other(tossWinner) : firstServer;
  const team = (s: Side) => (s === "A" ? b.teamA : b.teamB);
  const steps = ["Lineups & court", "Coin toss", "Sides", "Positions", "Start"];

  const start = async () => {
    if (!pos || !serving) return;
    const ok = r.send({ type: "SETUP", payload: { firstServingTeam: serving, positions: pos, teamAEnd: nearTeam === "A" ? "NEAR" : "FAR", coinTossWinner: tossWinner ?? undefined, coinTossChoice: tossChoice ?? undefined } });
    if (ok) vibrate([30, 40, 30]);
  };

  return (
    <div className="mx-auto max-w-xl">
      <Header b={b} />
      <div className="px-4 pt-4">
        <h1 className="text-xl font-black">
          <TeamChip team={b.teamA} /> <span className="mx-1 text-muted-foreground">vs</span> <TeamChip team={b.teamB} />
        </h1>
        <ol className="mt-3 flex gap-1" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-lime" : "bg-muted")} aria-current={i === step ? "step" : undefined}>
              <span className="sr-only">{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">Step {step + 1} of {steps.length} · {steps[step]}</p>
      </div>

      <div className="space-y-4 p-4">
        {step === 0 && (
          <>
            <CourtSelect r={r} b={b} />
            {[lineupA, lineupB].map((l) => l && <RefLineup key={l.side} r={r} b={b} side={l.side} />)}
            <Button size="lg" className="h-16 w-full text-lg" disabled={!bothIn} onClick={async () => {
              try {
                await api.post(`/api/ref/${b.match.id}/lineups/lock`, {}, r.headers);
                await r.load();
                setStep(1);
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}>
              <Lock /> Confirm &amp; lock lineups
            </Button>
            {!bothIn && <p className="text-center text-sm text-muted-foreground">Both teams must submit a lineup before the match can start.</p>}
          </>
        )}
        {step === 1 && (
          <>
            <h2 className="text-lg font-bold">Who won the coin toss?</h2>
            <TwoTeams b={b} value={tossWinner} onChange={setTossWinner} />
            {tossWinner && (
              <>
                <h2 className="text-lg font-bold">{team(tossWinner)?.name} chooses…</h2>
                <div className="grid grid-cols-3 gap-2">
                  {(["SERVE", "RECEIVE", "END"] as const).map((c) => (
                    <BigChoice key={c} active={tossChoice === c} onClick={() => setTossChoice(c)}>{c === "END" ? "Choose end" : c === "SERVE" ? "Serve" : "Receive"}</BigChoice>
                  ))}
                </div>
              </>
            )}
            {tossChoice === "END" && (
              <>
                <h2 className="text-lg font-bold">{team(other(tossWinner!))?.name} picks — who serves first?</h2>
                <TwoTeams b={b} value={firstServer} onChange={setFirstServer} />
              </>
            )}
            <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!serving} />
          </>
        )}
        {step === 2 && (
          <>
            <h2 className="text-lg font-bold">Standing at the net post, which team is on your LEFT?</h2>
            <TwoTeams b={b} value={nearTeam} onChange={(s) => setNearTeam(s)} />
            <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} />
          </>
        )}
        {step === 3 && pos && (
          <>
            <h2 className="text-lg font-bold">{b.config.format === "DOUBLES" ? "Who starts in the RIGHT court?" : "Players"}</h2>
            {(["A", "B"] as Side[]).map((s) => (
              <div key={s} className="rounded-xl border p-3">
                <div className="mb-2 flex items-center gap-2 font-semibold"><TeamChip team={team(s)} /> {team(s)?.name}{serving === s && <span className="ml-auto text-xs font-black uppercase text-lime-accent">serves first</span>}</div>
                <div className="grid grid-cols-2 gap-2">
                  <PosBox label="Left court" name={pos[s].left ? players.get(pos[s].left!)?.name : "—"} />
                  <PosBox label="Right court" name={players.get(pos[s].right)?.name} highlight />
                </div>
                {b.config.format === "DOUBLES" && (
                  <Button variant="secondary" className="mt-2 w-full" onClick={() => setPos((p) => p && { ...p, [s]: { right: p[s].left!, left: p[s].right } })}>
                    <ArrowLeftRight /> Swap sides
                  </Button>
                )}
              </div>
            ))}
            <Nav onBack={() => setStep(2)} onNext={() => setStep(4)} />
          </>
        )}
        {step === 4 && pos && serving && (
          <>
            <h2 className="text-lg font-bold">Ready</h2>
            <ul className="space-y-1 rounded-xl border p-4 text-sm">
              <li><b>{team(serving)?.name}</b> serves first from the right court: <b>{players.get(pos[serving].right)?.name}</b></li>
              <li><b>{team(nearTeam)?.name}</b> on your left, <b>{team(other(nearTeam))?.name}</b> on your right</li>
              <li>{b.config.scoringType === "RALLY" ? "Rally" : "Side-out"} scoring · games to {b.config.pointsToWin} · best of {b.config.bestOf}</li>
              <li>Opening call: <b className="tnum">{b.config.scoringType === "SIDE_OUT" && b.config.format === "DOUBLES" ? "0-0-2" : "0-0"}</b></li>
            </ul>
            <Button size="lg" className="h-20 w-full text-2xl font-black" onClick={start}>START MATCH</Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep(3)}>Back</Button>
          </>
        )}
      </div>
    </div>
  );
}

function CourtSelect({ r, b }: { r: R; b: RefBundle }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="rounded-xl border p-3">
      <label htmlFor="court" className="mb-2 block font-semibold">Court</label>
      <NativeSelect id="court" className="h-14 text-base" value={b.match.court ?? ""} disabled={busy} data-testid="court-select" onChange={async (e) => {
        setBusy(true);
        try {
          await api.put(`/api/ref/${b.match.id}/court`, { court: e.target.value }, r.headers);
          await r.load();
          toast.success(`Court set to ${e.target.value}`);
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}>
        <option value="" disabled>Select court…</option>
        {b.tournament.courtNames.map((c) => <option key={c} value={c}>{c}</option>)}
      </NativeSelect>
    </section>
  );
}

function PosBox({ label, name, highlight }: { label: string; name?: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3 text-center", highlight && "border-lime")}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-bold">{name ?? "—"}</div>
    </div>
  );
}

function Nav({ onBack, onNext, nextDisabled }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 pt-2">
      <Button variant="outline" size="lg" onClick={onBack}>Back</Button>
      <Button size="lg" onClick={onNext} disabled={nextDisabled}>Next</Button>
    </div>
  );
}

function BigChoice({ active, onClick, children, style }: { active?: boolean; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={style}
      className={cn("min-h-16 rounded-xl border-2 p-3 text-base font-bold transition-colors", active ? "border-lime bg-lime/10" : "border-border hover:bg-accent")}>
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
            <span className="flex flex-col items-center gap-1"><TeamChip team={t} size="lg" /> <span className="text-sm">{t?.name}</span></span>
          </BigChoice>
        );
      })}
    </div>
  );
}

function RefLineup({ r, b, side }: { r: R; b: RefBundle; side: Side }) {
  const info = b.lineups.teams.find((t) => t.side === side)!;
  const team = side === "A" ? b.teamA : b.teamB;
  const [editing, setEditing] = useState(!info.submitted);
  const [sel, setSel] = useState<string[]>(info.playerIds);
  const [busy, setBusy] = useState(false);
  const need = slotSize(b.category);
  const names = info.playerIds.map((id) => info.roster.find((p) => p.id === id)?.name ?? "?");
  const submit = async () => {
    setBusy(true);
    try {
      await api.put(`/api/ref/${b.match.id}/lineup`, { teamId: info.teamId, playerIds: sel }, r.headers);
      toast.success(`${team?.code} lineup saved`);
      await r.load();
      setEditing(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-xl border p-3" aria-label={`${team?.name} lineup`}>
      <div className="mb-2 flex items-center gap-2">
        <TeamChip team={team} />
        <span className="font-semibold">{team?.name}</span>
        {info.locked ? <span className="ml-auto flex items-center gap-1 text-xs font-bold text-muted-foreground"><Lock className="h-3 w-3" /> Locked</span>
          : info.submitted && !editing ? <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setEditing(true)}>Change</Button> : null}
      </div>
      {info.submitted && !editing ? (
        <p className="flex items-center gap-2 text-base font-bold"><CheckCircle2 className="h-5 w-5 text-lime-accent" /> {names.join(" & ")}</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">Select {need} player{need > 1 ? "s" : ""} from the {team?.code} roster. Ineligible players are greyed out with the reason.</p>
          <LineupSelects roster={info.roster} category={b.category} value={sel} onChange={setSel} teamCode={team?.code} />
          <Button className="mt-3 w-full" size="lg" disabled={sel.filter(Boolean).length !== need || busy} onClick={submit}>{busy && <Loader2 className="animate-spin" />} Submit lineup</Button>
        </>
      )}
    </section>
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
        <span className="font-semibold">Game {st.gameIndex + 1} of {st.config.bestOf}</span>
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
              <Clock /> TO {team(s)?.code} ({st.config.timeoutsPerGame - st.timeoutsUsed[s]} left)
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
