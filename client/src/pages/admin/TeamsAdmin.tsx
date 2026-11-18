import { useState } from "react";
import { ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { EmptyState, TeamLogo } from "@/components/match/bits";
import { api, errorMessage } from "@/lib/api";
import { toast } from "sonner";
import { uploadImage, useA, useAct } from "./data";
import type { ATeam } from "./types";
import { ConfirmButton, PageHeader } from "./ui";

export default function TeamsAdmin() {
  const { t, tid, lk } = useA();
  const act = useAct();
  const [e, setE] = useState<Partial<ATeam> | null>(null);
  const save = async () => {
    if (!e) return;
    const body = { name: e.name, code: e.code, color: e.color, logoMediaId: e.logoMediaId ?? null, captain: e.captain || null, managerName: e.managerName || null, managerContact: e.managerContact || null };
    const r = await act(() => (e.id ? api.patch(`/api/admin/teams/${e.id}`, body) : api.post(`/api/admin/tournaments/${tid}/teams`, body)), "Team saved");
    if (r) setE(null);
  };
  return (
    <div>
      <PageHeader title="Teams" description="Manager contact details are private and never shown publicly.">
        <Button onClick={() => setE({ name: "", code: "", color: "#3B82F6" })}><Plus /> New team</Button>
      </PageHeader>
      {!t.teams.length && <EmptyState title="No teams yet" />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {t.teams.map((team) => (
          <Card key={team.id} className="flex items-center gap-3 p-3">
            <TeamLogo team={lk.teams.get(team.id)} className="h-12 w-12" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{team.name} <span className="text-muted-foreground">({team.code})</span></div>
              <div className="truncate text-xs text-muted-foreground">{t.players.filter((p) => p.teamId === team.id).length} players{team.captain && ` · Capt. ${team.captain}`}{team.managerContact && ` · ${team.managerName ?? "Mgr"} ${team.managerContact}`}</div>
            </div>
            <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setE(team)}><Pencil /></Button>
            <ConfirmButton variant="ghost" size="icon" aria-label="Delete" title={`Delete ${team.name}?`} confirmLabel="Delete" onConfirm={() => act(() => api.del(`/api/admin/teams/${team.id}`), "Deleted")}><Trash2 /></ConfirmButton>
          </Card>
        ))}
      </div>
      <Dialog open={!!e} onOpenChange={(o) => !o && setE(null)}>
        {e && (
          <DialogContent title={e.id ? "Edit team" : "New team"}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={e.name ?? ""} onChange={(x) => setE({ ...e, name: x.target.value })} /></Field>
              <Field label="Code" hint="3 letters"><Input value={e.code ?? ""} maxLength={4} onChange={(x) => setE({ ...e, code: x.target.value.toUpperCase() })} /></Field>
              <Field label="Color"><Input type="color" value={e.color} onChange={(x) => setE({ ...e, color: x.target.value })} className="h-12 p-1" /></Field>
              <Field label="Logo">
                <label className="flex h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm hover:bg-accent">
                  <ImagePlus className="h-4 w-4" /> {e.logoMediaId ? "Replace logo" : "Upload logo"}
                  <input type="file" accept="image/*" className="sr-only" onChange={async (x) => {
                    const f = x.target.files?.[0];
                    if (!f) return;
                    try { setE({ ...e, logoMediaId: await uploadImage(f, 256) }); } catch (err) { toast.error(errorMessage(err)); }
                  }} />
                </label>
              </Field>
              <Field label="Captain"><Input value={e.captain ?? ""} onChange={(x) => setE({ ...e, captain: x.target.value })} /></Field>
              <Field label="Manager name"><Input value={e.managerName ?? ""} onChange={(x) => setE({ ...e, managerName: x.target.value })} /></Field>
              <Field label="Manager contact (private)" className="sm:col-span-2"><Input value={e.managerContact ?? ""} onChange={(x) => setE({ ...e, managerContact: x.target.value })} /></Field>
            </div>
            <Button onClick={save}>Save team</Button>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
