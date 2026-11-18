import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Loader2, LogOut, Plus, Whistle } from "@/components/ref/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { CategoryBadge, StatusPill, TeamChip } from "@/components/match/bits";
import { Logo } from "@/components/Logo";
import { useBundle, useLookups } from "@/hooks/useBundle";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MatchSummary, TieSummary } from "@shared/api";
import { busyConflicts, busyMessage } from "@shared/tie/teamBusy";

interface Me { admin: boolean; referee: boolean; refUsername?: string; email?: string }
interface TRow { id: string; slug: string; name: string }

const DONE = ["FINISHED", "WALKOVER", "RETIRED", "NOT_REQUIRED"];

/**
 * Referee console for the SHARED referee login: sign in once, then pick Team A, Team B, the tie, the court
 * and the category match. Scoring then continues in the normal referee wizard (lineups from dropdowns,
 * toss, sides, positions, games/points) at /ref/:matchId — no per-match link needed.
 */
export default function RefConsole() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/api/auth/me") });
  useEffect(() => {
    document.title = "Referee · PickleLive";
  }, []);
  if (me.isLoading) return <div className="grid min-h-dvh place-items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!me.data?.referee && !me.data?.admin) return <RefLogin />;
  return <Chooser who={me.data.refUsername ?? me.data.email ?? "admin"} isRef={me.data.referee} />;
}

function RefLogin() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm p-5">
        <Logo />
        <h1 className="mt-5 flex items-center gap-2 font-display text-3xl font-bold uppercase tracking-wide"><Whistle className="h-7 w-7 text-lime-accent" /> Referee sign-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">One shared login for all referees. Ask the tournament admin for it.</p>
        <form className="mt-5 grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          setWorking(true);
          try {
            await api.post("/api/auth/ref-login", { username, password });
            await qc.invalidateQueries({ queryKey: ["me"] });
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setWorking(false);
          }
        }}>
          <Field label="Username"><Input autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required className="h-14 text-lg" /></Field>
          <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-14 text-lg" /></Field>
          <Button type="submit" size="lg" className="h-14 text-lg" disabled={working}>{working && <Loader2 className="animate-spin" />} Sign in</Button>
        </form>
      </Card>
    </div>
  );
}

function Chooser({ who, isRef }: { who: string; isRef: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const list = useQuery({ queryKey: ["tournaments"], queryFn: () => api.get<TRow[]>("/api/public/tournaments") });
  const [chosenT, setChosenT] = useState(params.get("t") ?? "");
  const tid = chosenT && list.data?.some((t) => t.id === chosenT) ? chosenT : list.data?.[0]?.id ?? "";
  const slug = list.data?.find((t) => t.id === tid)?.slug ?? list.data?.[0]?.slug;
  const q = useBundle(slug);
  const lk = useLookups(q.data);
  const b = q.data;

  const [teamA, setTeamA] = useState(params.get("a") ?? "");
  const [teamB, setTeamB] = useState(params.get("b") ?? "");
  const [tieId, setTieId] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [court, setCourt] = useState("");
  const [working, setWorking] = useState(false);

  // remember the pair in the URL so "Choose another match" brings the referee back here
  useEffect(() => {
    const next = new URLSearchParams();
    if (tid) next.set("t", tid);
    if (teamA) next.set("a", teamA);
    else next.delete("a");
    if (teamB) next.set("b", teamB);
    else next.delete("b");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [tid, teamA, teamB, params, setParams]);

  const ties = useMemo<TieSummary[]>(() => {
    if (!b || !teamA || !teamB) return [];
    return b.ties.filter((t) => (t.teamAId === teamA && t.teamBId === teamB) || (t.teamAId === teamB && t.teamBId === teamA));
  }, [b, teamA, teamB]);
  useEffect(() => {
    // auto-pick: the only tie, else the one in progress, else the next scheduled
    const pick = ties.length === 1 ? ties[0] : ties.find((t) => t.status === "IN_PROGRESS" || t.status === "DECIDED") ?? ties.find((t) => t.status === "SCHEDULED");
    setTieId(pick?.id ?? null);
    setMatchId(null);
  }, [ties]);
  const tie = ties.find((t) => t.id === tieId);
  // one team, one tie at a time
  const busy = useMemo(() => (b && tie ? busyConflicts(b.ties, tie.id) : []), [b, tie]);
  const blocked = busy.length > 0;
  const match = tie?.matches.find((m) => m.id === matchId);
  useEffect(() => setCourt(match?.court ?? ""), [match?.id, match?.court]);

  if (!b) return <div className="grid min-h-dvh place-items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  const team = (id: string | null | undefined) => lk.teams.get(id ?? "");

  const go = async () => {
    if (!match) return;
    setWorking(true);
    try {
      if (court && court !== match.court) await api.put(`/api/ref/${match.id}/court`, { court });
      nav(`/ref/${match.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur">
        <Whistle className="h-6 w-6 text-lime-accent" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl font-bold uppercase leading-none tracking-wide">Referee</div>
          <div className="truncate text-xs text-muted-foreground">{b.tournament.name} · signed in as {who}</div>
        </div>
        {isRef && (
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={async () => { await api.post("/api/auth/ref-logout"); qc.invalidateQueries({ queryKey: ["me"] }); }}><LogOut /></Button>
        )}
      </header>

      <div className="space-y-5 p-4">
        {(list.data?.length ?? 0) > 1 && (
          <Field label="Tournament">
            <NativeSelect value={tid} onChange={(e) => { setChosenT(e.target.value); setTeamA(""); setTeamB(""); }} className="h-14 text-base">
              {list.data!.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </NativeSelect>
          </Field>
        )}

        <Step n={1} title="Teams">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="Team A">
              <NativeSelect value={teamA} onChange={(e) => setTeamA(e.target.value)} className="h-14 text-base" data-testid="ref-team-a">
                <option value="">Select…</option>
                {b.teams.map((t) => <option key={t.id} value={t.id} disabled={t.id === teamB}>{t.name}</option>)}
              </NativeSelect>
            </Field>
            <span className="pb-4 font-display text-lg font-bold text-muted-foreground">VS</span>
            <Field label="Team B">
              <NativeSelect value={teamB} onChange={(e) => setTeamB(e.target.value)} className="h-14 text-base" data-testid="ref-team-b">
                <option value="">Select…</option>
                {b.teams.map((t) => <option key={t.id} value={t.id} disabled={t.id === teamA}>{t.name}</option>)}
              </NativeSelect>
            </Field>
          </div>
        </Step>

        {teamA && teamB && (
          <Step n={2} title="Tie">
            {ties.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm">
                <p className="mb-3 text-muted-foreground">There's no tie between {team(teamA)?.name} and {team(teamB)?.name} in the schedule.</p>
                <Button variant="outline" disabled={working} onClick={async () => {
                  setWorking(true);
                  try {
                    await api.post("/api/ref-session/ties", { tournamentId: b.tournament.id, teamAId: teamA, teamBId: teamB });
                    await qc.invalidateQueries({ queryKey: ["bundle", slug] });
                    toast.success("Extra tie created");
                  } catch (e) {
                    toast.error(errorMessage(e));
                  } finally {
                    setWorking(false);
                  }
                }}><Plus /> Start an extra tie</Button>
              </div>
            ) : (
              <div className="grid gap-2">
                {ties.map((t) => (
                  <button key={t.id} type="button" onClick={() => { setTieId(t.id); setMatchId(null); }} aria-pressed={t.id === tieId}
                    className={cn("flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition-colors", t.id === tieId ? "border-lime bg-lime/10" : "hover:bg-accent")}>
                    <TeamChip team={team(t.teamAId)} /> <span className="score-display text-2xl">{t.scoreA}–{t.scoreB}</span> <TeamChip team={team(t.teamBId)} />
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{t.roundLabel}</span>
                    <span className="text-xs font-bold uppercase text-muted-foreground">{t.status.replace("_", " ").toLowerCase()}</span>
                  </button>
                ))}
              </div>
            )}
          </Step>
        )}

        {tie && busy.length > 0 && (
          <div role="alert" className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm font-semibold text-amber-600 dark:text-amber-300" data-testid="busy-warning">
            {busyMessage(busy, (id) => team(id)?.name ?? "A team")}
          </div>
        )}
        {tie && (
          <Step n={3} title="Category">
            <div className="grid gap-2" role="listbox" aria-label="Category matches">
              {tie.matches.map((m) => <MatchOption key={m.id} m={m} selected={m.id === matchId} onSelect={() => setMatchId(m.id)} lk={lk} />)}
            </div>
          </Step>
        )}

        {match && (
          <Step n={4} title="Court">
            <NativeSelect value={court} onChange={(e) => setCourt(e.target.value)} className="h-14 text-base" data-testid="ref-court">
              <option value="">Select court…</option>
              {b.tournament.courtNames.map((c) => <option key={c} value={c}>{c}</option>)}
            </NativeSelect>
          </Step>
        )}
      </div>

      {match && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto max-w-xl">
            <Button size="lg" className="h-16 w-full text-lg font-black" disabled={working || !court || (blocked && match.seq === 0)} onClick={go} data-testid="ref-continue">
              {working && <Loader2 className="animate-spin" />}
              {match.status === "LIVE" || match.status === "PAUSED" ? "Resume scoring" : "Continue: players, toss & scoring"} <ChevronRight />
            </Button>
            {!court && <p className="mt-1 text-center text-xs text-muted-foreground">Pick the court first.</p>}
            {court && blocked && match.seq === 0 && <p className="mt-1 text-center text-xs text-amber-500">One of these teams is still playing another tie.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-lime text-sm text-black">{n}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function MatchOption({ m, selected, onSelect, lk }: { m: MatchSummary; selected: boolean; onSelect: () => void; lk: ReturnType<typeof useLookups> }) {
  const cat = lk.categories.get(m.categoryId);
  const done = DONE.includes(m.status);
  return (
    <button type="button" role="option" aria-selected={selected} disabled={done} onClick={onSelect} data-testid={`ref-cat-${cat?.code}`}
      className={cn("flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition-colors", selected ? "border-lime bg-lime/10" : "hover:bg-accent", done && "cursor-not-allowed opacity-50 hover:bg-transparent")}>
      <span className="text-sm font-bold text-muted-foreground tnum">#{m.slotOrder}</span>
      <CategoryBadge category={cat} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{cat?.name}{m.isDecider ? " · decider" : ""}</span>
        <span className="block text-xs text-muted-foreground">{m.court ?? "No court yet"} · {m.bestOf === 1 ? "1 game" : `best of ${m.bestOf}`} to {m.pointsToWin}{done && m.games.length ? ` · ${m.games.map((g) => `${g.a}-${g.b}`).join(" ")}` : ""}</span>
      </span>
      <StatusPill status={m.status} />
    </button>
  );
}
