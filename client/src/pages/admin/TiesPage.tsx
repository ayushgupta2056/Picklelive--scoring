import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/input";
import { CategoryBadge, EmptyState, StatusPill, TeamChip } from "@/components/match/bits";
import { api } from "@/lib/api";
import { fmtDay, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useA, useAct } from "./data";
import { PageHeader } from "./ui";

export default function TiesPage() {
  const { b, lk, tid, t } = useA();
  const act = useAct();
  const [stage, setStage] = useState("");
  const [open, setOpen] = useState(false);
  const [nt, setNt] = useState({ stageId: t.stages[0]?.id ?? "", groupId: "", teamAId: "", teamBId: "" });
  const ties = b.ties.filter((x) => !stage || x.stageId === stage);
  const tz = b.tournament.timezone;
  return (
    <div>
      <PageHeader title="Ties & lineups" description="Open a tie to enter lineups, share referee links and control its matches.">
        <NativeSelect className="h-12 w-52" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage"><option value="">All stages</option>{b.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
        <Button variant="outline" onClick={() => setOpen(true)} disabled={!t.stages.length}><Plus /> Manual tie</Button>
      </PageHeader>
      {!ties.length && <EmptyState title="No ties yet">Generate them from Stages.</EmptyState>}
      <ul className="grid gap-2">
        {ties.map((tie) => {
          const live = tie.matches.some((m) => m.status === "LIVE");
          const missing = tie.matches.filter((m) => m.status !== "NOT_REQUIRED" && (!m.lineupA || !m.lineupB)).length;
          return (
            <li key={tie.id}>
              <Link to={`/admin/t/${tid}/ties/${tie.id}`} className={cn("grid gap-2 rounded-xl border p-3 hover:bg-accent/40 md:grid-cols-[12rem_1fr_auto] md:items-center", live && "border-live/50")}>
                <span className="text-sm"><b>{tie.roundLabel}</b><br /><span className="text-muted-foreground">{fmtDay(tie.matches[0]?.scheduledAt, tz)} {fmtTime(tie.matches[0]?.scheduledAt, tz)}</span></span>
                <span className="flex flex-wrap items-center gap-2">
                  <TeamChip team={lk.teams.get(tie.teamAId ?? "")} /> <b className="text-xl tnum">{tie.scoreA}–{tie.scoreB}</b> <TeamChip team={lk.teams.get(tie.teamBId ?? "")} />
                  <span className="ml-2 flex flex-wrap gap-1">{tie.matches.map((m) => <span key={m.id} className={cn("rounded", m.status === "LIVE" && "ring-2 ring-live")}><CategoryBadge category={lk.categories.get(m.categoryId)} className={cn(["FINISHED", "WALKOVER", "RETIRED"].includes(m.status) && "opacity-50")} /></span>)}</span>
                </span>
                <span className="flex items-center gap-2 text-xs">
                  {missing > 0 && tie.status !== "FINISHED" && <span className="text-amber-500">{missing} lineup{missing > 1 ? "s" : ""} missing</span>}
                  <StatusPill status={live ? "LIVE" : tie.status === "FINISHED" ? "FINISHED" : "SCHEDULED"} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Create a tie manually">
          <Field label="Stage"><NativeSelect value={nt.stageId} onChange={(e) => setNt({ ...nt, stageId: e.target.value, groupId: "" })}>{t.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
          {(t.stages.find((s) => s.id === nt.stageId)?.groups.length ?? 0) > 0 && <Field label="Group"><NativeSelect value={nt.groupId} onChange={(e) => setNt({ ...nt, groupId: e.target.value })}><option value="">None</option>{t.stages.find((s) => s.id === nt.stageId)!.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect></Field>}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Team A"><NativeSelect value={nt.teamAId} onChange={(e) => setNt({ ...nt, teamAId: e.target.value })}><option value="">Pick…</option>{t.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect></Field>
            <Field label="Team B"><NativeSelect value={nt.teamBId} onChange={(e) => setNt({ ...nt, teamBId: e.target.value })}><option value="">Pick…</option>{t.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect></Field>
          </div>
          <Button disabled={!nt.teamAId || !nt.teamBId} onClick={async () => { if (await act(() => api.post(`/api/admin/tournaments/${tid}/ties`, { ...nt, groupId: nt.groupId || null, roundLabel: "Extra tie" }), "Tie created")) setOpen(false); }}>Create tie</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
