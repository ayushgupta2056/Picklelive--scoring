import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { AlertTriangle, CalendarClock, Printer, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CategoryBadge, TeamChip } from "@/components/match/bits";
import { api } from "@/lib/api";
import { dayKey, fmtDay, fmtTime, zonedToISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Conflict } from "@shared/tournament/conflicts";
import type { MatchSummary } from "@shared/api";
import { useA, useAct } from "./data";
import { PageHeader } from "./ui";

export default function ScheduleBoard() {
  const { b, lk, tid, t } = useA();
  const act = useAct();
  const tz = b.tournament.timezone;
  const slotMin = t.settings.matchDurationMinutes || 30;
  const all = useMemo(() => b.ties.flatMap((x) => x.matches).filter((m) => m.status !== "NOT_REQUIRED"), [b.ties]);
  const days = [...new Set(all.map((m) => dayKey(m.scheduledAt, tz)).filter((d) => d !== "unscheduled"))].sort();
  const [day, setDay] = useState(days[0] ?? t.startDate ?? new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = useState({ category: "", team: "", court: "" });
  const [auto, setAuto] = useState(false);
  const conflicts = useQuery({ queryKey: ["conflicts", tid, b.generatedAt, all.map((m) => `${m.court}${m.scheduledAt}`).join()], queryFn: () => api.get<Conflict[]>(`/api/admin/tournaments/${tid}/conflicts`) });
  const conflictIds = new Set(conflicts.data?.flatMap((c) => c.matchIds) ?? []);

  const matchOk = (m: MatchSummary) => {
    const tie = lk.ties.get(m.tieId)!;
    return (!filter.category || m.categoryId === filter.category) && (!filter.team || tie.teamAId === filter.team || tie.teamBId === filter.team);
  };
  const courts = t.courtNames.filter((c) => !filter.court || c === filter.court);
  const dayMatches = all.filter((m) => dayKey(m.scheduledAt, tz) === day);
  // time rows (wall clock in tournament tz)
  const minutesOf = (iso: string) => {
    const [h, mm] = fmtTime(iso, tz).split(":").map(Number);
    return h * 60 + mm;
  };
  const startMin = Math.min(8 * 60, ...dayMatches.map((m) => minutesOf(m.scheduledAt!)));
  const endMin = Math.max(19 * 60, ...dayMatches.map((m) => minutesOf(m.scheduledAt!) + slotMin));
  const rows: number[] = [];
  for (let x = Math.floor(startMin / slotMin) * slotMin; x < endMin; x += slotMin) rows.push(x);
  const hhmm = (x: number) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  const cellMatches = (court: string, row: number) => dayMatches.filter((m) => m.court === court && minutesOf(m.scheduledAt!) >= row && minutesOf(m.scheduledAt!) < row + slotMin);
  const unscheduled = all.filter((m) => !m.scheduledAt || !m.court);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const [court, row] = String(e.over.id).split("|");
    const id = String(e.active.id);
    if (court === "unscheduled") return act(() => api.patch(`/api/admin/matches/${id}`, { scheduledAt: null, court: null }), "Unscheduled");
    act(() => api.patch(`/api/admin/matches/${id}`, { court, scheduledAt: zonedToISO(`${day}T${hhmm(Number(row))}`, tz) }), `Moved to ${court} ${hhmm(Number(row))}`);
  };

  return (
    <div>
      <PageHeader title="Schedule board" description={`Drag matches between courts and times (${tz}). Matches of the same tie can run in parallel on different courts.`}>
        <Button variant="outline" onClick={() => setAuto(true)}><Wand2 /> Auto-schedule</Button>
        <Button asChild variant="outline"><a href={`/admin/t/${tid}/print`} target="_blank" rel="noreferrer"><Printer /> Printable</a></Button>
      </PageHeader>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input type="date" className="h-11 w-44" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" />
        {days.map((d) => <Button key={d} variant={d === day ? "default" : "outline"} size="sm" onClick={() => setDay(d)}>{fmtDay(`${d}T12:00:00Z`, "UTC")}</Button>)}
        <NativeSelect className="h-11 w-44" value={filter.court} onChange={(e) => setFilter({ ...filter, court: e.target.value })} aria-label="Court"><option value="">All courts</option>{t.courtNames.map((c) => <option key={c}>{c}</option>)}</NativeSelect>
        <NativeSelect className="h-11 w-48" value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })} aria-label="Category"><option value="">All categories</option>{t.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
        <NativeSelect className="h-11 w-48" value={filter.team} onChange={(e) => setFilter({ ...filter, team: e.target.value })} aria-label="Team"><option value="">All teams</option>{t.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect>
      </div>
      {conflicts.data && conflicts.data.length > 0 && (
        <details className="mb-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm" open>
          <summary className="flex cursor-pointer items-center gap-2 font-bold text-amber-600 dark:text-amber-400"><AlertTriangle className="h-4 w-4" /> {conflicts.data.length} scheduling warning{conflicts.data.length > 1 ? "s" : ""}</summary>
          <ul className="mt-2 grid gap-1">{conflicts.data.map((c, i) => <li key={i}><b>{c.kind.replace(/_/g, " ").toLowerCase()}</b>: {c.message}</li>)}</ul>
        </details>
      )}
      <DndContext sensors={sensors} onDragEnd={onEnd}>
        <div className="grid gap-4 xl:grid-cols-[1fr_16rem]">
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[720px] table-fixed text-xs">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr><th className="w-16 p-2 text-left">Time</th>{courts.map((c) => <th key={c} className="p-2 text-left">{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r} className="border-t">
                    <td className="p-2 align-top font-bold tnum text-muted-foreground">{hhmm(r)}</td>
                    {courts.map((c) => (
                      <Cell key={c} id={`${c}|${r}`}>
                        {cellMatches(c, r).map((m) => <MatchCard key={m.id} m={m} dim={!matchOk(m)} conflict={conflictIds.has(m.id)} />)}
                      </Cell>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><CalendarClock className="h-4 w-4" /> Unscheduled ({unscheduled.length})</h2>
            <Cell id="unscheduled|0" as="div" className="min-h-24 rounded-xl border border-dashed p-2">
              <div className="grid gap-1">{unscheduled.map((m) => <MatchCard key={m.id} m={m} dim={!matchOk(m)} conflict={false} />)}</div>
            </Cell>
          </div>
        </div>
      </DndContext>
      <AutoDialog open={auto} onOpenChange={setAuto} day={day} slotMin={slotMin} />
    </div>
  );
}

function Cell({ id, children, as = "td", className }: { id: string; children: React.ReactNode; as?: "td" | "div"; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const Comp = as;
  return <Comp ref={setNodeRef as never} className={cn("h-16 p-1 align-top", isOver && "bg-lime/15", className)}>{children}</Comp>;
}

function MatchCard({ m, dim, conflict }: { m: MatchSummary; dim: boolean; conflict: boolean }) {
  const { lk, tid } = useA();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: m.id, disabled: ["LIVE", "FINISHED", "WALKOVER", "RETIRED"].includes(m.status) });
  const tie = lk.ties.get(m.tieId)!;
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn("mb-1 flex cursor-grab touch-none items-center gap-1 rounded-md border bg-card p-1.5 shadow-sm", dim && "opacity-30", conflict && "border-amber-500", isDragging && "z-50 shadow-xl ring-2 ring-lime", m.status === "LIVE" && "border-live")}>
      <CategoryBadge category={lk.categories.get(m.categoryId)} />
      <TeamChip team={lk.teams.get(tie.teamAId ?? "")} size="sm" className="h-5 min-w-8 text-[10px]" />
      <TeamChip team={lk.teams.get(tie.teamBId ?? "")} size="sm" className="h-5 min-w-8 text-[10px]" />
      {conflict && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />}
      <Link to={`/admin/t/${tid}/ties/${tie.id}`} className="ml-auto text-[10px] text-muted-foreground hover:underline" onPointerDown={(e) => e.stopPropagation()}>open</Link>
    </div>
  );
}

function AutoDialog({ open, onOpenChange, day, slotMin }: { open: boolean; onOpenChange: (o: boolean) => void; day: string; slotMin: number }) {
  const { tid, b } = useA();
  const act = useAct();
  const [start, setStart] = useState(`${day}T09:00`);
  const [slot, setSlot] = useState(slotMin);
  const [onlyUn, setOnlyUn] = useState(true);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Auto-schedule" description="Places each tie's matches on parallel courts, advancing one slot when all courts are full. You can drag to adjust afterwards.">
        <Field label={`Start (${b.tournament.timezone})`}><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Slot length (minutes)"><Input type="number" min={5} value={slot} onChange={(e) => setSlot(Number(e.target.value) || 30)} /></Field>
        <Switch label="Only matches without a time" checked={onlyUn} onCheckedChange={setOnlyUn} />
        <Button onClick={async () => { if (await act(() => api.post(`/api/admin/tournaments/${tid}/auto-schedule`, { start: zonedToISO(start, b.tournament.timezone), slotMinutes: slot, onlyUnscheduled: onlyUn }), "Scheduled")) onOpenChange(false); }}>Schedule</Button>
      </DialogContent>
    </Dialog>
  );
}
