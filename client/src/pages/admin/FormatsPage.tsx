import { useState } from "react";
import { Copy, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SortableList } from "@/components/Sortable";
import { CategoryBadge, EmptyState } from "@/components/match/bits";
import { api } from "@/lib/api";
import { uid } from "@/lib/utils";
import { useA, useAct } from "./data";
import type { ATemplate } from "./types";
import { ConfirmButton, PageHeader } from "./ui";

type Draft = Omit<ATemplate, "id" | "slots"> & { id?: string; slots: { key: string; categoryId: string; weight: number; isDecider: boolean }[] };

export default function FormatsPage() {
  const { t, tid, lk } = useA();
  const act = useAct();
  const [d, setD] = useState<Draft | null>(null);
  const fresh = (): Draft => ({ name: "Team format", levelPolicy: "DECIDER", stopEarly: true, earlyStopMode: "NOT_REQUIRED", usageLimit: 2, allowPairRepeat: false, rosterMin: 4, rosterMax: 12, blindLineup: false, slots: [] });
  const open = (tpl?: ATemplate) => setD(tpl ? { ...tpl, slots: tpl.slots.map((s) => ({ key: s.id, categoryId: s.categoryId, weight: s.weight, isDecider: s.isDecider })) } : fresh());
  const save = async () => {
    if (!d) return;
    const body = { ...d, slots: d.slots.map(({ categoryId, weight, isDecider }) => ({ categoryId, weight, isDecider })) };
    const r = await act(() => (d.id ? api.put(`/api/admin/templates/${d.id}`, body) : api.post(`/api/admin/tournaments/${tid}/templates`, body)), "Tie format saved");
    if (r) setD(null);
  };
  return (
    <div>
      <PageHeader title="Tie formats" description="A tie format is the ordered list of category matches every Team A vs Team B tie contains.">
        <Button onClick={() => open()}><Plus /> New format</Button>
      </PageHeader>
      {t.templates.length === 0 && <EmptyState title="No tie formats yet">Create one with the categories each tie should include.</EmptyState>}
      <div className="grid gap-3 lg:grid-cols-2">
        {t.templates.map((tpl) => (
          <Card key={tpl.id} className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="font-bold">{tpl.name}</h2>
              {t.defaultTemplateId === tpl.id && <span className="flex items-center gap-1 rounded bg-lime/15 px-1.5 py-0.5 text-xs font-bold text-lime-accent"><Star className="h-3 w-3" /> default</span>}
              <div className="ml-auto flex">
                {t.defaultTemplateId !== tpl.id && <Button variant="ghost" size="sm" onClick={() => act(() => api.patch(`/api/admin/tournaments/${tid}`, { defaultTemplateId: tpl.id }), "Default set")}>Make default</Button>}
                <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => open(tpl)}><Pencil /></Button>
                <Button variant="ghost" size="icon" aria-label="Clone" onClick={() => act(() => api.post(`/api/admin/templates/${tpl.id}/clone`), "Cloned")}><Copy /></Button>
                <ConfirmButton variant="ghost" size="icon" aria-label="Delete" title={`Delete ${tpl.name}?`} description="Existing ties keep their matches." confirmLabel="Delete" onConfirm={() => act(() => api.del(`/api/admin/templates/${tpl.id}`), "Deleted")}><Trash2 /></ConfirmButton>
              </div>
            </div>
            <ol className="grid gap-1 text-sm">
              {tpl.slots.map((s, i) => {
                const c = lk.categories.get(s.categoryId);
                return <li key={s.id} className="flex items-center gap-2"><span className="w-5 text-muted-foreground tnum">{i + 1}.</span><CategoryBadge category={c} /> {c?.name}{s.weight > 1 && <b className="text-xs">×{s.weight}</b>}{s.isDecider && <span className="text-xs font-bold text-amber-500">decider</span>}</li>;
              })}
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
              Level tie: {tpl.levelPolicy === "DECIDER" ? "play decider" : "draw"} · {tpl.stopEarly ? `stop early (${tpl.earlyStopMode === "NOT_REQUIRED" ? "not required" : "dead rubbers"})` : "play all"} · max {tpl.usageLimit} categories/player · pair repeat {tpl.allowPairRepeat ? "allowed" : "not allowed"} · roster {tpl.rosterMin}–{tpl.rosterMax}{tpl.blindLineup && " · blind lineups"}
            </p>
          </Card>
        ))}
      </div>
      <Dialog open={!!d} onOpenChange={(o) => !o && setD(null)}>
        {d && (
          <DialogContent title={d.id ? "Edit tie format" : "New tie format"} className="max-w-2xl">
            <Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
            <div>
              <h3 className="mb-2 font-bold">Category slots <span className="text-sm font-normal text-muted-foreground">(drag to reorder)</span></h3>
              <SortableList items={d.slots} getId={(s) => s.key} onChange={(slots) => setD({ ...d, slots })} render={(s, i) => (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-5 text-sm font-bold text-muted-foreground tnum">{i + 1}</span>
                  <NativeSelect aria-label="Category" className="h-10 min-w-0 flex-1" value={s.categoryId} onChange={(e) => setD({ ...d, slots: d.slots.map((x) => (x.key === s.key ? { ...x, categoryId: e.target.value } : x)) })}>
                    {t.categories.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                  </NativeSelect>
                  <label className="flex items-center gap-1 text-sm">Points <Input type="number" min={1} max={10} className="h-10 w-16" value={s.weight} onChange={(e) => setD({ ...d, slots: d.slots.map((x) => (x.key === s.key ? { ...x, weight: Number(e.target.value) || 1 } : x)) })} /></label>
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" className="h-5 w-5 accent-lime" checked={s.isDecider} onChange={(e) => setD({ ...d, slots: d.slots.map((x) => (x.key === s.key ? { ...x, isDecider: e.target.checked } : x)) })} /> Decider</label>
                  <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Remove slot" onClick={() => setD({ ...d, slots: d.slots.filter((x) => x.key !== s.key) })}><X /></Button>
                </div>
              )} />
              <Button variant="outline" className="mt-2" disabled={!t.categories.length} onClick={() => setD({ ...d, slots: [...d.slots, { key: uid(), categoryId: t.categories[0].id, weight: 1, isDecider: false }] })}><Plus /> Add slot</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="If the tie is level"><NativeSelect value={d.levelPolicy} onChange={(e) => setD({ ...d, levelPolicy: e.target.value as Draft["levelPolicy"] })}><option value="DECIDER">Play the decider slot</option><option value="DRAW">Allow a draw</option></NativeSelect></Field>
              <Field label="Once the tie is decided"><NativeSelect value={d.stopEarly ? d.earlyStopMode : "PLAY_ALL"} onChange={(e) => setD({ ...d, stopEarly: e.target.value !== "PLAY_ALL", earlyStopMode: e.target.value === "DEAD_RUBBER" ? "DEAD_RUBBER" : "NOT_REQUIRED" })}><option value="NOT_REQUIRED">Stop: remaining "not required"</option><option value="DEAD_RUBBER">Stop scoring, play dead rubbers</option><option value="PLAY_ALL">Play everything (no early stop)</option></NativeSelect></Field>
              <Field label="Max categories per player per tie"><Input type="number" min={1} max={10} value={d.usageLimit} onChange={(e) => setD({ ...d, usageLimit: Number(e.target.value) || 1 })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Roster min"><Input type="number" min={1} value={d.rosterMin} onChange={(e) => setD({ ...d, rosterMin: Number(e.target.value) || 1 })} /></Field>
                <Field label="Roster max"><Input type="number" min={1} value={d.rosterMax} onChange={(e) => setD({ ...d, rosterMax: Number(e.target.value) || 1 })} /></Field>
              </div>
              <Switch label="Same pair may play more than one slot" checked={d.allowPairRepeat} onCheckedChange={(v) => setD({ ...d, allowPairRepeat: v })} />
              <Switch label="Blind lineups (hidden until both submitted)" checked={d.blindLineup} onCheckedChange={(v) => setD({ ...d, blindLineup: v })} />
            </div>
            <Button onClick={save} disabled={!d.slots.length}>Save tie format</Button>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
