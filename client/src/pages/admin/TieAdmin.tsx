import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Ban, ClipboardEdit, Copy, ExternalLink, KeyRound, Lock, Pause, Play, Plus, QrCode, RefreshCw, RotateCcw, ShieldAlert, Unlock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { SortableList } from "@/components/Sortable";
import { ScoringConfigFields } from "@/components/ScoringConfigFields";
import { LineupPicker, slotSize } from "@/components/match/LineupPicker";
import { CategoryBadge, StatusPill, TeamChip } from "@/components/match/bits";
import { QrDialog } from "@/components/public/Share";
import { api, errorMessage } from "@/lib/api";
import { getSocket, useRooms } from "@/lib/socket";
import { isoToZoned, zonedToISO } from "@/lib/format";
import { uid } from "@/lib/utils";
import { SOCKET, type PublicCategory, type MatchSummary, type SlotLineupInfo, type TieLineups, type TieSummary } from "@shared/api";
import type { MatchConfig } from "@shared/scoring/types";
import { useA, useAct } from "./data";
import { ConfirmButton } from "./ui";

export default function TieAdmin() {
  const { tieId = "" } = useParams();
  const { tid, lk, t } = useA();
  const qc = useQueryClient();
  const key = ["admin-tie", tieId];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ tie: TieSummary; lineups: TieLineups }>(`/api/admin/ties/${tieId}`) });
  useRooms([`tie:${tieId}`]);
  useEffect(() => {
    const s = getSocket();
    const inv = (x: { tieId?: string; id?: string }) => (x.tieId === tieId || x.id === tieId) && qc.invalidateQueries({ queryKey: ["admin-tie", tieId] });
    s.on(SOCKET.matchUpdate, inv);
    s.on(SOCKET.tieUpdate, inv);
    return () => {
      s.off(SOCKET.matchUpdate, inv);
      s.off(SOCKET.tieUpdate, inv);
    };
  }, [tieId, qc]);
  const [slotsOpen, setSlotsOpen] = useState(false);
  if (!q.data) return <p className="text-muted-foreground">Loading tie…</p>;
  const { tie, lineups } = q.data;
  const A = lk.teams.get(tie.teamAId ?? "");
  const B = lk.teams.get(tie.teamBId ?? "");
  const reload = () => qc.invalidateQueries({ queryKey: key });
  return (
    <div className="space-y-4">
      <Link to={`/admin/t/${tid}/ties`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"><ArrowLeft className="h-4 w-4" /> All ties</Link>
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <div>
          <div className="text-xs font-semibold text-muted-foreground">{tie.roundLabel}</div>
          <div className="flex items-center gap-3 text-2xl font-black">
            <TeamChip team={A} size="lg" /> <span className="tnum">{tie.scoreA}–{tie.scoreB}</span> <TeamChip team={B} size="lg" />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{A?.name ?? "TBD"} vs {B?.name ?? "TBD"} · {tie.status.replace("_", " ").toLowerCase()}{tie.winner && ` · winner ${tie.winner === "DRAW" ? "draw" : tie.winner === "A" ? A?.code : B?.code}`}</div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSlotsOpen(true)}><ClipboardEdit /> Edit this tie's slots</Button>
          <Button asChild variant="ghost"><a href={`/t/${t.slug}/tie/${tie.id}`} target="_blank" rel="noreferrer"><ExternalLink /> Public</a></Button>
          <Button asChild variant="ghost"><a href={`/t/${t.slug}/tv?tie=${tie.id}`} target="_blank" rel="noreferrer">TV</a></Button>
        </div>
      </Card>
      {lineups.blind && <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">Blind lineups: each team's lineup stays hidden publicly until both teams have submitted.</p>}
      {(!tie.teamAId || !tie.teamBId) && <p className="rounded-lg bg-muted p-3 text-sm">Teams will be filled in automatically when the previous round finishes.</p>}
      <div className="grid gap-4">
        {tie.matches.map((m) => <MatchPanel key={m.id} m={m} tie={tie} slot={lineups.slots.find((s) => s.matchId === m.id)} reload={reload} />)}
      </div>
      <SlotEditor open={slotsOpen} onOpenChange={setSlotsOpen} tie={tie} reload={reload} />
    </div>
  );
}

function MatchPanel({ m, tie, slot, reload }: { m: MatchSummary; tie: TieSummary; slot?: SlotLineupInfo; reload: () => void }) {
  const { lk, b, t } = useA();
  const act = useAct();
  const cat = lk.categories.get(m.categoryId);
  const tz = b.tournament.timezone;
  const [ref, setRef] = useState<string | null>(null);
  const [qr, setQr] = useState(false);
  const [score, setScore] = useState(false);
  const [cfg, setCfg] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, msg?: string) => {
    const r = await act(fn, msg);
    reload();
    return r;
  };
  const loadRef = async () => {
    try {
      const d = await api.get<{ refPath: string | null }>(`/api/admin/matches/${m.id}`);
      if (!d.refPath) toast.message("Referee link is revoked. Generate a new one.");
      setRef(d.refPath);
      return d.refPath;
    } catch (e) {
      toast.error(errorMessage(e));
      return null;
    }
  };
  const refUrl = ref ? new URL(ref, window.location.origin).toString() : "";
  const started = m.seq > 0;
  const done = ["FINISHED", "WALKOVER", "RETIRED"].includes(m.status);
  const nextSeq = m.seq + 1;
  const sendEvent = (event: Record<string, unknown>, msg: string) => run(() => api.post(`/api/admin/matches/${m.id}/events`, { seq: nextSeq, idempotencyKey: uid(), event }), msg);

  return (
    <Card className="p-4" data-testid={`match-panel-${m.slotOrder}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-black text-muted-foreground tnum">#{m.slotOrder}</span>
        <CategoryBadge category={cat} />
        <h3 className="font-bold">{cat?.name}</h3>
        {m.isDecider && <span className="text-xs font-bold text-amber-500">decider</span>}
        {m.weight > 1 && <span className="text-xs font-bold">×{m.weight}</span>}
        <StatusPill status={m.status} />
        {m.live && <span className="rounded bg-muted px-2 py-0.5 text-sm font-black tnum">{m.live.call}</span>}
        {m.games.length > 0 && <span className="text-sm font-bold tnum">{m.games.map((g) => `${g.a}-${g.b}`).join(" ")}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Court" className="h-10 w-32" value={m.court ?? ""} onChange={(e) => run(() => api.patch(`/api/admin/matches/${m.id}`, { court: e.target.value || null }), "Court set")}>
            <option value="">No court</option>{t.courtNames.map((c) => <option key={c}>{c}</option>)}
          </NativeSelect>
          <Input aria-label="Start time" type="datetime-local" className="h-10 w-52" defaultValue={isoToZoned(m.scheduledAt, tz)} key={m.scheduledAt ?? "none"}
            onBlur={(e) => e.target.value !== isoToZoned(m.scheduledAt, tz) && run(() => api.patch(`/api/admin/matches/${m.id}`, { scheduledAt: e.target.value ? zonedToISO(e.target.value, tz) : null }), "Time set")} />
        </div>
      </div>

      {slot && (
        <div className="grid gap-4 lg:grid-cols-2">
          {slot.teams.map((tm) => <TeamLineup key={tm.teamId} matchId={m.id} info={tm} category={cat} disabled={started} reload={reload} blindHidden={false} />)}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
        <Button variant="secondary" size="sm" onClick={async () => { const p = await loadRef(); if (p) window.open(p, "_blank"); }}><Play /> Open ref screen</Button>
        <Button variant="outline" size="sm" onClick={async () => { const p = await loadRef(); if (p) { await navigator.clipboard.writeText(new URL(p, window.location.origin).toString()); toast.success("Referee link copied"); } }}><Copy /> Copy ref link</Button>
        <Button variant="outline" size="sm" onClick={async () => { if (await loadRef()) setQr(true); }}><QrCode /> QR</Button>
        <ConfirmButton variant="outline" size="sm" title="Regenerate referee link?" description="The old link stops working immediately and any connected referee is disconnected." confirmLabel="Regenerate"
          onConfirm={async () => { const r = await run(() => api.post<{ refPath: string }>(`/api/admin/matches/${m.id}/ref-link`), "New referee link created"); if (r) setRef(r.refPath); }}><RefreshCw /> Regenerate</ConfirmButton>
        <ConfirmButton variant="outline" size="sm" title="Revoke referee link?" description="The referee is disconnected instantly." confirmLabel="Revoke" onConfirm={() => run(() => api.del(`/api/admin/matches/${m.id}/ref-link`), "Referee link revoked")}><KeyRound /> Revoke</ConfirmButton>
        <span className="mx-1 w-px bg-border" />
        {m.status === "LIVE" && <Button variant="outline" size="sm" onClick={() => run(() => api.post(`/api/admin/matches/${m.id}/action`, { action: "PAUSE" }), "Paused")}><Pause /> Pause</Button>}
        {m.status === "PAUSED" && <Button variant="outline" size="sm" onClick={() => run(() => api.post(`/api/admin/matches/${m.id}/action`, { action: "RESUME" }), "Resumed")}><Play /> Resume</Button>}
        {!done && m.status !== "NOT_REQUIRED" && tie.teamAId && tie.teamBId && (["A", "B"] as const).map((s) => (
          <ConfirmButton key={s} variant="outline" size="sm" title={`${lk.teams.get((s === "A" ? tie.teamAId : tie.teamBId)!)?.name} forfeits?`} description="The other team is awarded the match (walkover)." confirmLabel="Award walkover"
            onConfirm={() => sendEvent({ type: "FORFEIT", payload: { team: s } }, "Walkover recorded")}><Ban /> W/O vs {lk.teams.get((s === "A" ? tie.teamAId : tie.teamBId)!)?.code}</ConfirmButton>
        ))}
        {started && !done && (["A", "B"] as const).map((s) => (
          <ConfirmButton key={`r${s}`} variant="outline" size="sm" title="Record retirement?" confirmLabel="Retire" onConfirm={() => sendEvent({ type: "RETIRE", payload: { team: s } }, "Retirement recorded")}>{lk.teams.get((s === "A" ? tie.teamAId : tie.teamBId)!)?.code} retires</ConfirmButton>
        ))}
        {tie.teamAId && tie.teamBId && <Button variant="outline" size="sm" onClick={() => setScore(true)}><ClipboardEdit /> {done ? "Edit final score" : "Enter result"}</Button>}
        {!started && <Button variant="ghost" size="sm" onClick={() => setCfg(true)}>Scoring rules</Button>}
        {started && <ConfirmButton variant="ghost" size="sm" title="Reset this match?" description="All score events are removed (kept in the audit log) and lineups are unlocked." confirmLabel="Reset" onConfirm={() => run(() => api.post(`/api/admin/matches/${m.id}/action`, { action: "RESET" }), "Match reset")}><RotateCcw /> Reset</ConfirmButton>}
      </div>
      {ref && <QrDialog open={qr} onOpenChange={setQr} url={refUrl} title={`Referee · ${cat?.code} ${lk.teams.get(tie.teamAId ?? "")?.code} v ${lk.teams.get(tie.teamBId ?? "")?.code}`} description="Scan on the referee's phone. This link can score only this match." />}
      <ScoreDialog open={score} onOpenChange={setScore} m={m} tie={tie} onSave={(games, winner, reason) => sendEvent({ type: "ADMIN_SET_RESULT", payload: { games, winner, reason } }, "Result saved")} />
      <ConfigDialog open={cfg} onOpenChange={setCfg} matchId={m.id} onSaved={reload} />
    </Card>
  );
}

function TeamLineup({ matchId, info, category, disabled, reload }: { matchId: string; info: SlotLineupInfo["teams"][number]; category?: PublicCategory; disabled: boolean; reload: () => void; blindHidden: boolean }) {
  const { lk } = useA();
  const act = useAct();
  const [sel, setSel] = useState<string[]>(info.playerIds);
  const [overrides, setOverrides] = useState<string[]>(info.overridePlayerIds);
  const [reason, setReason] = useState(info.overrideReason ?? "");
  const [askOverride, setAskOverride] = useState<string | null>(null);
  useEffect(() => {
    setSel(info.playerIds);
    setOverrides(info.overridePlayerIds);
    setReason(info.overrideReason ?? "");
  }, [info.playerIds, info.overridePlayerIds, info.overrideReason]);
  const need = slotSize(category);
  const team = lk.teams.get(info.teamId);
  const dirty = sel.join() !== info.playerIds.join() || overrides.join() !== info.overridePlayerIds.join();
  const usedOverrides = overrides.filter((o) => sel.includes(o));
  const submit = async () => {
    const r = await act(() => api.put(`/api/admin/matches/${matchId}/lineup`, { teamId: info.teamId, playerIds: sel, overridePlayerIds: usedOverrides, overrideReason: usedOverrides.length ? reason : null }), `${team?.code} lineup saved`);
    if (r) reload();
  };
  const askedPlayer = info.roster.find((p) => p.id === askOverride);
  return (
    <div className="rounded-xl border p-3" data-testid={`lineup-${team?.code}`}>
      <div className="mb-2 flex items-center gap-2">
        <TeamChip team={team} /> <span className="font-semibold">{team?.name}</span>
        <span className="ml-auto flex items-center gap-1">
          {info.locked ? (
            <Button variant="ghost" size="sm" onClick={() => act(() => api.post(`/api/admin/matches/${matchId}/lineups/lock`, { locked: false, teamId: info.teamId }), "Unlocked").then(reload)}><Unlock /> Unlock</Button>
          ) : info.submitted ? (
            <Button variant="ghost" size="sm" onClick={() => act(() => api.post(`/api/admin/matches/${matchId}/lineups/lock`, { locked: true, teamId: info.teamId }), "Locked").then(reload)}><Lock /> Lock</Button>
          ) : <span className="text-xs text-amber-500">not submitted</span>}
        </span>
      </div>
      <LineupPicker roster={info.roster} category={category} value={sel} onChange={setSel} overrides={overrides} disabled={info.locked || disabled} onOverride={(id) => setAskOverride(id)} />
      {usedOverrides.length > 0 && <p className="mt-2 flex items-center gap-1 text-xs text-amber-500"><ShieldAlert className="h-3 w-3" /> Override: {reason}</p>}
      {!info.locked && !disabled && (
        <Button className="mt-3 w-full" disabled={sel.length !== need || !dirty} onClick={submit}>{info.submitted ? "Update lineup" : "Submit lineup"}</Button>
      )}
      <Dialog open={!!askOverride} onOpenChange={(o) => !o && setAskOverride(null)}>
        {askedPlayer && (
          <DialogContent title={`Override eligibility for ${askedPlayer.name}?`} description={`Blocked because: ${askedPlayer.reasons.join(", ")}. A reason is required and is written to the audit log.`}>
            <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Approved by tournament referee: birth certificate checked" /></Field>
            <Button disabled={!reason.trim()} onClick={() => {
              setOverrides([...new Set([...overrides, askedPlayer.id])]);
              setSel(need === 1 ? [askedPlayer.id] : [...sel.filter((x) => x !== askedPlayer.id), askedPlayer.id].slice(-need));
              setAskOverride(null);
            }}>Allow with override</Button>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function ScoreDialog({ open, onOpenChange, m, tie, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; m: MatchSummary; tie: TieSummary; onSave: (g: { a: number; b: number }[], w: "A" | "B", reason: string) => Promise<unknown> }) {
  const { lk } = useA();
  const [games, setGames] = useState<{ a: string; b: string }[]>(() => (m.games.length ? m.games.map((g) => ({ a: String(g.a), b: String(g.b) })) : [{ a: "", b: "" }]));
  const [reason, setReason] = useState("");
  const parsed = games.filter((g) => g.a !== "" && g.b !== "").map((g) => ({ a: Number(g.a), b: Number(g.b) }));
  const wa = parsed.filter((g) => g.a > g.b).length;
  const wb = parsed.filter((g) => g.b > g.a).length;
  const winner = wa === wb ? null : wa > wb ? "A" : "B";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Enter / correct the final score" description="Recorded as an admin result event (audited); referee scoring history is kept.">
        <div className="grid gap-2">
          <div className="grid grid-cols-[3rem_1fr_1fr_2.5rem] items-center gap-2 text-sm font-bold"><span /><span>{lk.teams.get(tie.teamAId ?? "")?.code}</span><span>{lk.teams.get(tie.teamBId ?? "")?.code}</span><span /></div>
          {games.map((g, i) => (
            <div key={i} className="grid grid-cols-[3rem_1fr_1fr_2.5rem] items-center gap-2">
              <span className="text-sm text-muted-foreground">G{i + 1}</span>
              <Input type="number" min={0} value={g.a} aria-label={`Game ${i + 1} team A`} onChange={(e) => setGames(games.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
              <Input type="number" min={0} value={g.b} aria-label={`Game ${i + 1} team B`} onChange={(e) => setGames(games.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))} />
              <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Remove game" onClick={() => setGames(games.filter((_, j) => j !== i))}><X /></Button>
            </div>
          ))}
          {games.length < m.bestOf && <Button variant="outline" size="sm" onClick={() => setGames([...games, { a: "", b: "" }])}><Plus /> Add game</Button>}
        </div>
        <Field label="Reason (optional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Button disabled={!winner} onClick={async () => { await onSave(parsed, winner!, reason); onOpenChange(false); }}>Save: {winner ? `${lk.teams.get((winner === "A" ? tie.teamAId : tie.teamBId) ?? "")?.name} win ${Math.max(wa, wb)}-${Math.min(wa, wb)}` : "enter scores"}</Button>
      </DialogContent>
    </Dialog>
  );
}

function ConfigDialog({ open, onOpenChange, matchId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; matchId: string; onSaved: () => void }) {
  const act = useAct();
  const [v, setV] = useState<Partial<MatchConfig> | null>(null);
  useEffect(() => {
    if (open) api.get<{ configOverride: Partial<MatchConfig> | null }>(`/api/admin/matches/${matchId}`).then((d) => setV(d.configOverride ?? {}));
  }, [open, matchId]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Scoring rules for this match" description="Overrides the category default for this one match. Blank fields use the category default." className="max-w-2xl">
        {v && <ScoringConfigFields value={v} onChange={setV} />}
        <Button onClick={async () => { if (await act(() => api.patch(`/api/admin/matches/${matchId}`, { configOverride: v && Object.keys(v).length ? v : null }), "Rules saved")) { onSaved(); onOpenChange(false); } }}>Save</Button>
      </DialogContent>
    </Dialog>
  );
}

function SlotEditor({ open, onOpenChange, tie, reload }: { open: boolean; onOpenChange: (o: boolean) => void; tie: TieSummary; reload: () => void }) {
  const { t } = useA();
  const act = useAct();
  const [slots, setSlots] = useState(() => tie.matches.map((m) => ({ key: m.id, matchId: m.id as string | undefined, categoryId: m.categoryId, weight: m.weight, isDecider: m.isDecider, locked: m.seq > 0 })));
  useEffect(() => {
    if (open) setSlots(tie.matches.map((m) => ({ key: m.id, matchId: m.id, categoryId: m.categoryId, weight: m.weight, isDecider: m.isDecider, locked: m.seq > 0 })));
  }, [open, tie.matches]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Override this tie's slots" description="Add, remove or reorder category matches for this tie only. Scored matches can't be removed." className="max-w-2xl">
        <SortableList items={slots} getId={(s) => s.key} onChange={setSlots} render={(s, i) => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-5 text-sm font-bold text-muted-foreground">{i + 1}</span>
            <NativeSelect aria-label="Category" className="h-10 min-w-0 flex-1" disabled={s.locked} value={s.categoryId} onChange={(e) => setSlots(slots.map((x) => (x.key === s.key ? { ...x, categoryId: e.target.value } : x)))}>
              {t.categories.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </NativeSelect>
            <Input type="number" min={1} aria-label="Points" className="h-10 w-16" value={s.weight} onChange={(e) => setSlots(slots.map((x) => (x.key === s.key ? { ...x, weight: Number(e.target.value) || 1 } : x)))} />
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" className="h-5 w-5 accent-lime" checked={s.isDecider} onChange={(e) => setSlots(slots.map((x) => (x.key === s.key ? { ...x, isDecider: e.target.checked } : x)))} /> Decider</label>
            <Button variant="ghost" size="icon" className="h-10 w-10" disabled={s.locked} aria-label="Remove" onClick={() => setSlots(slots.filter((x) => x.key !== s.key))}><X /></Button>
          </div>
        )} />
        <Button variant="outline" onClick={() => setSlots([...slots, { key: uid(), matchId: undefined, categoryId: t.categories[0]?.id ?? "", weight: 1, isDecider: false, locked: false }])}><Plus /> Add slot</Button>
        <Button onClick={async () => {
          if (await act(() => api.put(`/api/admin/ties/${tie.id}/slots`, slots.map(({ matchId, categoryId, weight, isDecider }) => ({ matchId, categoryId, weight, isDecider }))), "Tie slots updated")) {
            reload();
            onOpenChange(false);
          }
        }}>Save slots</Button>
      </DialogContent>
    </Dialog>
  );
}
