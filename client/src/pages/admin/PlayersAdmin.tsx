import { useMemo, useState } from "react";
import { Download, FileUp, ImagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState, TeamChip } from "@/components/match/bits";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ageGroupLabel, ageOn } from "@shared/eligibility/eligibility";
import { PLAYER_CSV_TEMPLATE } from "@shared/csv";
import { uploadImage, useA, useAct } from "./data";
import type { APlayer } from "./types";
import { ConfirmButton, PageHeader, num } from "./ui";

interface Report { report: { row: number; ok: boolean; errors: string[] }[]; valid: number; invalid: number; created: number }

export default function PlayersAdmin() {
  const { t, tid, lk } = useA();
  const act = useAct();
  const [e, setE] = useState<Partial<APlayer> | null>(null);
  const [team, setTeam] = useState("");
  const [q, setQ] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const list = useMemo(() => t.players.filter((p) => (!team || (team === "none" ? !p.teamId : p.teamId === team)) && p.name.toLowerCase().includes(q.toLowerCase())), [t.players, team, q]);

  const save = async () => {
    if (!e) return;
    const body = { name: e.name, teamId: e.teamId || null, gender: e.gender, dob: e.dob || null, skill: e.skill ?? null, jersey: e.jersey || null, handedness: e.handedness || null, phone: e.phone || null, notes: e.notes || null, photoMediaId: e.photoMediaId ?? null };
    const r = await act(() => (e.id ? api.patch(`/api/admin/players/${e.id}`, body) : api.post(`/api/admin/tournaments/${tid}/players`, body)), "Player saved");
    if (r) setE(null);
  };

  return (
    <div>
      <PageHeader title="Players" description="Upload each team's roster once. Lineups for every tie are picked from it. Public pages show only the age group, never DOB or phone.">
        <Button variant="outline" onClick={() => setCsvOpen(true)}><FileUp /> Import CSV</Button>
        <Button onClick={() => setE({ name: "", gender: "MALE", teamId: team && team !== "none" ? team : null })}><Plus /> New player</Button>
      </PageHeader>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 pl-9" placeholder="Search" value={q} onChange={(x) => setQ(x.target.value)} aria-label="Search players" /></div>
        <NativeSelect className="h-11 w-56" value={team} onChange={(x) => setTeam(x.target.value)} aria-label="Filter by team">
          <option value="">All teams ({t.players.length})</option>
          {t.teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name} ({t.players.filter((p) => p.teamId === tm.id).length})</option>)}
          <option value="none">No team</option>
        </NativeSelect>
      </div>
      {!list.length ? <EmptyState title="No players">Add players one by one or import a CSV.</EmptyState> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Name</th><th className="p-2">Team</th><th className="p-2">G</th><th className="p-2">DOB / age</th><th className="p-2">Group</th><th className="p-2">DUPR</th><th className="p-2">#</th><th className="p-2">Phone</th><th /></tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-semibold">{p.photoMediaId && <img src={`/api/media/${p.photoMediaId}`} alt="" className="mr-2 inline h-7 w-7 rounded-full object-cover" />}{p.name}</td>
                  <td className="p-2"><TeamChip team={lk.teams.get(p.teamId ?? "")} size="sm" /></td>
                  <td className="p-2">{p.gender === "MALE" ? "M" : "F"}</td>
                  <td className="p-2 tnum">{p.dob ? `${p.dob} (${ageOn(p.dob, t.ageCutoffDate)})` : "—"}</td>
                  <td className="p-2">{ageGroupLabel(p.dob, t.ageCutoffDate)}</td>
                  <td className="p-2 tnum">{p.skill ?? "—"}</td>
                  <td className="p-2 tnum">{p.jersey ?? ""}</td>
                  <td className="p-2 text-muted-foreground">{p.phone ?? ""}</td>
                  <td className="whitespace-nowrap p-1 text-right">
                    <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Edit" onClick={() => setE(p)}><Pencil /></Button>
                    <ConfirmButton variant="ghost" size="icon" className="h-10 w-10" aria-label="Delete" title={`Delete ${p.name}?`} confirmLabel="Delete" onConfirm={() => act(() => api.del(`/api/admin/players/${p.id}`), "Deleted")}><Trash2 /></ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!e} onOpenChange={(o) => !o && setE(null)}>
        {e && (
          <DialogContent title={e.id ? "Edit player" : "New player"} className="max-w-xl">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" className="sm:col-span-2"><Input value={e.name ?? ""} onChange={(x) => setE({ ...e, name: x.target.value })} /></Field>
              <Field label="Team"><NativeSelect value={e.teamId ?? ""} onChange={(x) => setE({ ...e, teamId: x.target.value || null })}><option value="">No team</option>{t.teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}</NativeSelect></Field>
              <Field label="Gender"><NativeSelect value={e.gender} onChange={(x) => setE({ ...e, gender: x.target.value as APlayer["gender"] })}><option value="MALE">Male</option><option value="FEMALE">Female</option></NativeSelect></Field>
              <Field label="Date of birth" hint={e.dob ? `${ageOn(e.dob, t.ageCutoffDate)} on cutoff · ${ageGroupLabel(e.dob, t.ageCutoffDate)}` : "Needed for age categories"}><Input type="date" value={e.dob ?? ""} onChange={(x) => setE({ ...e, dob: x.target.value || null })} /></Field>
              <Field label="Skill / DUPR"><Input type="number" step="0.01" value={e.skill ?? ""} onChange={(x) => setE({ ...e, skill: num(x.target.value) })} /></Field>
              <Field label="Jersey no."><Input value={e.jersey ?? ""} onChange={(x) => setE({ ...e, jersey: x.target.value })} /></Field>
              <Field label="Handedness"><NativeSelect value={e.handedness ?? ""} onChange={(x) => setE({ ...e, handedness: (x.target.value || null) as APlayer["handedness"] })}><option value="">—</option><option value="R">Right</option><option value="L">Left</option></NativeSelect></Field>
              <Field label="Phone (private)"><Input value={e.phone ?? ""} onChange={(x) => setE({ ...e, phone: x.target.value })} /></Field>
              <Field label="Photo">
                <label className="flex h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm hover:bg-accent">
                  {e.photoMediaId ? <img src={`/api/media/${e.photoMediaId}`} alt="" className="h-8 w-8 rounded-full object-cover" /> : <ImagePlus className="h-4 w-4" />} {e.photoMediaId ? "Replace" : "Upload"} (auto-resized)
                  <input type="file" accept="image/*" className="sr-only" onChange={async (x) => {
                    const f = x.target.files?.[0];
                    if (!f) return;
                    try { setE({ ...e, photoMediaId: await uploadImage(f, 384) }); } catch (err) { toast.error(errorMessage(err)); }
                  }} />
                </label>
              </Field>
              <Field label="Notes" className="sm:col-span-2"><Textarea value={e.notes ?? ""} onChange={(x) => setE({ ...e, notes: x.target.value })} /></Field>
            </div>
            <Button onClick={save}>Save player</Button>
          </DialogContent>
        )}
      </Dialog>
      <CsvImport open={csvOpen} onOpenChange={setCsvOpen} />
    </div>
  );
}

function CsvImport({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { tid, t, refresh } = useA();
  const [csv, setCsv] = useState("");
  const [rep, setRep] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const r = await api.post<Report>(`/api/admin/tournaments/${tid}/players/import`, { csv, dryRun });
      setRep(r);
      if (!dryRun) {
        toast.success(`Imported ${r.created} players${r.invalid ? ` (${r.invalid} rows skipped)` : ""}`);
        await refresh();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(PLAYER_CSV_TEMPLATE)}`;
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setRep(null); setCsv(""); } }}>
      <DialogContent title="Import players from CSV" className="max-w-2xl" description={`Columns: name, gender (M/F), dob (YYYY-MM-DD or DD/MM/YYYY), team_code (${t.teams.map((x) => x.code).join(", ") || "none yet"}), skill, jersey, handedness, phone, notes.`}>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><a href={template} download="players-template.csv"><Download /> Download template</a></Button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-semibold hover:bg-accent">
            <FileUp className="h-4 w-4" /> Upload .csv
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (x) => { const f = x.target.files?.[0]; if (f) { setCsv(await f.text()); setRep(null); } }} />
          </label>
        </div>
        <Textarea className="min-h-40 font-mono text-xs" placeholder="…or paste CSV here" value={csv} onChange={(x) => { setCsv(x.target.value); setRep(null); }} aria-label="CSV contents" />
        {rep && (
          <div className="max-h-56 overflow-y-auto rounded-lg border text-sm">
            <div className="sticky top-0 bg-muted px-3 py-2 font-semibold">{rep.valid} valid · {rep.invalid} with errors{rep.created ? ` · ${rep.created} imported` : ""}</div>
            <ul>
              {rep.report.map((r) => (
                <li key={r.row} className={cn("flex gap-2 border-t px-3 py-1.5", !r.ok && "bg-destructive/10")}>
                  <span className="w-14 shrink-0 text-muted-foreground tnum">Row {r.row}</span>
                  <span className={r.ok ? "text-lime-accent" : "text-destructive"}>{r.ok ? "OK" : r.errors.join("; ")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={!csv.trim() || busy} onClick={() => run(true)}>Check rows</Button>
          <Button disabled={!csv.trim() || busy || (rep ? rep.valid === 0 : false)} onClick={() => run(false)}>Import valid rows</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
