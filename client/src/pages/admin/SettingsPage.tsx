import { useState } from "react";
import { ArrowDown, ArrowUp, Download, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/api";
import type { Tiebreak } from "@shared/tournament/standings";
import { uploadImage, useA, useAct } from "./data";
import { ConfirmButton, PageHeader } from "./ui";
import { useNavigate } from "react-router-dom";

const TB_LABEL: Record<Tiebreak, string> = { TIE_POINTS: "Tie points", HEAD_TO_HEAD: "Head-to-head", MATCH_DIFF: "Match difference", GAME_DIFF: "Game difference", POINT_DIFF: "Point difference", POINTS_FOR: "Points scored" };

export default function SettingsPage() {
  const { t, tid } = useA();
  const act = useAct();
  const nav = useNavigate();
  const [f, setF] = useState({ name: t.name, slug: t.slug, venue: t.venue ?? "", startDate: t.startDate ?? "", endDate: t.endDate ?? "", timezone: t.timezone, ageCutoffDate: t.ageCutoffDate, courts: t.courtNames.join("\n"), logoMediaId: t.logoMediaId, published: t.published });
  const [s, setS] = useState(t.settings);
  const move = (i: number, d: number) => {
    const o = [...s.tiebreakOrder];
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setS({ ...s, tiebreakOrder: o });
  };
  const save = () => act(() => api.patch(`/api/admin/tournaments/${tid}`, {
    name: f.name, slug: f.slug, venue: f.venue || null, startDate: f.startDate || null, endDate: f.endDate || null, timezone: f.timezone, ageCutoffDate: f.ageCutoffDate,
    courtNames: f.courts.split("\n").map((x) => x.trim()).filter(Boolean), logoMediaId: f.logoMediaId ?? null, published: f.published,
    settings: { pointsWin: s.pointsWin, pointsDraw: s.pointsDraw, pointsLoss: s.pointsLoss, tiebreakOrder: s.tiebreakOrder, restGapMinutes: s.restGapMinutes, soundsEnabled: s.soundsEnabled, matchDurationMinutes: s.matchDurationMinutes },
  }), "Settings saved");
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings">
        <Button asChild variant="outline"><a href={`/api/admin/tournaments/${tid}/export/standings.csv`}><Download /> Standings CSV</a></Button>
        <Button asChild variant="outline"><a href={`/api/admin/tournaments/${tid}/export/results.csv`}><Download /> Results CSV</a></Button>
      </PageHeader>
      <div className="grid gap-4">
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
          <h2 className="font-bold sm:col-span-2">Tournament</h2>
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Slug"><Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} /></Field>
          <Field label="Venue"><Input value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
          <Field label="Timezone" hint="IANA name, e.g. Asia/Kolkata"><Input value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></Field>
          <Field label="Start date"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
          <Field label="End date"><Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
          <Field label="Age cutoff date"><Input type="date" value={f.ageCutoffDate} onChange={(e) => setF({ ...f, ageCutoffDate: e.target.value })} /></Field>
          <Field label="Logo">
            <label className="flex h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm hover:bg-accent">
              {f.logoMediaId ? <img src={`/api/media/${f.logoMediaId}`} alt="" className="h-8 w-8 rounded object-cover" /> : <ImagePlus className="h-4 w-4" />} Upload logo
              <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; if (file) try { setF({ ...f, logoMediaId: await uploadImage(file, 256) }); } catch (err) { toast.error(errorMessage(err)); } }} />
            </label>
          </Field>
          <Field label="Courts (one per line)"><Textarea value={f.courts} onChange={(e) => setF({ ...f, courts: e.target.value })} /></Field>
          <Switch label="Listed on the public home page" checked={f.published} onCheckedChange={(v) => setF({ ...f, published: v })} />
        </Card>
        <Card className="grid gap-3 p-4 sm:grid-cols-3">
          <h2 className="font-bold sm:col-span-3">Points system & tiebreaks</h2>
          <Field label="Tie win"><Input type="number" value={s.pointsWin} onChange={(e) => setS({ ...s, pointsWin: Number(e.target.value) })} /></Field>
          <Field label="Tie draw"><Input type="number" value={s.pointsDraw} onChange={(e) => setS({ ...s, pointsDraw: Number(e.target.value) })} /></Field>
          <Field label="Tie loss"><Input type="number" value={s.pointsLoss} onChange={(e) => setS({ ...s, pointsLoss: Number(e.target.value) })} /></Field>
          <ol className="grid gap-1 sm:col-span-3">
            {s.tiebreakOrder.map((tb, i) => (
              <li key={tb} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                <span className="w-5 font-bold tnum">{i + 1}</span> {TB_LABEL[tb]}
                <Button variant="ghost" size="icon" className="ml-auto h-9 w-9" aria-label="Up" onClick={() => move(i, -1)}><ArrowUp /></Button>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Down" onClick={() => move(i, 1)}><ArrowDown /></Button>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="grid gap-3 p-4 sm:grid-cols-3">
          <h2 className="font-bold sm:col-span-3">Scheduling & referee</h2>
          <Field label="Rest gap (minutes)" hint="Warn when a player has less rest between matches"><Input type="number" value={s.restGapMinutes} onChange={(e) => setS({ ...s, restGapMinutes: Number(e.target.value) })} /></Field>
          <Field label="Default match slot (minutes)"><Input type="number" value={s.matchDurationMinutes} onChange={(e) => setS({ ...s, matchDurationMinutes: Number(e.target.value) })} /></Field>
          <Switch label="Referee sounds on by default" checked={s.soundsEnabled} onCheckedChange={(v) => setS({ ...s, soundsEnabled: v })} />
        </Card>
        <div className="flex gap-2">
          <Button onClick={save}>Save settings</Button>
          <ConfirmButton variant="destructive" className="ml-auto" title="Delete this tournament?" description="Everything (teams, players, ties, scores) is permanently deleted." confirmLabel="Delete forever"
            onConfirm={async () => { if (await act(() => api.del(`/api/admin/tournaments/${tid}`), "Deleted")) nav("/admin"); }}>Delete tournament</ConfirmButton>
        </div>
      </div>
    </div>
  );
}
