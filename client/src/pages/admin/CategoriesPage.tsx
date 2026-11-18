import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { ScoringConfigFields } from "@/components/ScoringConfigFields";
import { CategoryBadge, EmptyState } from "@/components/match/bits";
import { api } from "@/lib/api";
import { describeAgeRule } from "@shared/eligibility/eligibility";
import { useA, useAct } from "./data";
import type { ACategory } from "./types";
import { ConfirmButton, PageHeader, num } from "./ui";

const blank = (): Partial<ACategory> => ({ name: "", code: "", format: "DOUBLES", genderRule: "ANY", ageRuleType: "NONE", ageMin: null, ageMax: null, skillMin: null, skillMax: null, color: "#C6FF00", icon: "trophy", scoringConfig: {} });

export function genderLabel(g: string) {
  return { ANY: "Any gender", MALE: "Men", FEMALE: "Women", MIXED: "Mixed (1M + 1F)" }[g] ?? g;
}

export default function CategoriesPage() {
  const { t, tid, b } = useA();
  const act = useAct();
  const [edit, setEdit] = useState<Partial<ACategory> | null>(null);
  const cats = t.categories;
  const move = (i: number, d: number) => {
    const ids = cats.map((c) => c.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    act(() => api.post(`/api/admin/tournaments/${tid}/categories/reorder`, { ids }));
  };
  const save = async () => {
    if (!edit) return;
    const body = { ...edit, ageMin: edit.ageMin ?? null, ageMax: edit.ageMax ?? null };
    const r = await act(() => (edit.id ? api.patch(`/api/admin/categories/${edit.id}`, body) : api.post(`/api/admin/tournaments/${tid}/categories`, body)), "Category saved");
    if (r) setEdit(null);
  };
  return (
    <div>
      <PageHeader title="Categories" description={`Define who can play each slot. Ages are checked on the cutoff date (${t.ageCutoffDate}).`}>
        <Button variant="outline" onClick={() => act(() => api.post(`/api/admin/tournaments/${tid}/categories/presets`), "Presets added")}><Sparkles /> Add presets</Button>
        <Button onClick={() => setEdit(blank())}><Plus /> New category</Button>
      </PageHeader>
      {cats.length === 0 && <EmptyState title="No categories">Add presets or create your own.</EmptyState>}
      <ul className="divide-y rounded-xl border">
        {cats.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex flex-col">
              <Button variant="ghost" size="icon" className="h-6 w-8" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}><ArrowUp /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-8" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === cats.length - 1}><ArrowDown /></Button>
            </div>
            <CategoryBadge category={b.categories.find((x) => x.id === c.id) ?? { ...c, ageLabel: "" }} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{c.name}</div>
              <div className="text-xs text-muted-foreground">
                {c.format === "SINGLES" ? "Singles" : "Doubles"} · {genderLabel(c.genderRule)} · {describeAgeRule({ type: c.ageRuleType, min: c.ageMin, max: c.ageMax })}
                {(c.skillMin != null || c.skillMax != null) && ` · DUPR ${c.skillMin ?? "–"}–${c.skillMax ?? "–"}`}
                {" · "}{c.scoringConfig.scoringType === "RALLY" ? "rally" : "side-out"} to {c.scoringConfig.pointsToWin ?? 11}, {(c.scoringConfig.bestOf ?? 1) === 1 ? "1 game" : `best of ${c.scoringConfig.bestOf}`}
              </div>
            </div>
            <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEdit(c)}><Pencil /></Button>
            <Button variant="ghost" size="icon" aria-label="Clone" onClick={() => act(() => api.post(`/api/admin/categories/${c.id}/clone`), "Cloned")}><Copy /></Button>
            <ConfirmButton variant="ghost" size="icon" aria-label="Delete" title={`Delete ${c.name}?`} confirmLabel="Delete" onConfirm={() => act(() => api.del(`/api/admin/categories/${c.id}`), "Deleted")}><Trash2 /></ConfirmButton>
          </li>
        ))}
      </ul>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && (
          <DialogContent title={edit.id ? "Edit category" : "New category"} className="max-w-2xl">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="U18 Boys Doubles" /></Field>
              <Field label="Short code" hint="Shown on chips, e.g. U18BD"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} maxLength={8} /></Field>
              <Field label="Format"><NativeSelect value={edit.format} onChange={(e) => setEdit({ ...edit, format: e.target.value as ACategory["format"], genderRule: e.target.value === "SINGLES" && edit.genderRule === "MIXED" ? "ANY" : edit.genderRule })}><option value="DOUBLES">Doubles</option><option value="SINGLES">Singles</option></NativeSelect></Field>
              <Field label="Gender rule"><NativeSelect value={edit.genderRule} onChange={(e) => setEdit({ ...edit, genderRule: e.target.value as ACategory["genderRule"] })}><option value="ANY">Any</option><option value="MALE">Men only</option><option value="FEMALE">Women only</option>{edit.format === "DOUBLES" && <option value="MIXED">Mixed (1M + 1F)</option>}</NativeSelect></Field>
              <Field label="Age rule"><NativeSelect value={edit.ageRuleType} onChange={(e) => setEdit({ ...edit, ageRuleType: e.target.value as ACategory["ageRuleType"] })}><option value="NONE">None</option><option value="UNDER">Under X</option><option value="OVER">X and over</option><option value="RANGE">Age range</option></NativeSelect></Field>
              <div className="grid grid-cols-2 gap-2">
                {(edit.ageRuleType === "OVER" || edit.ageRuleType === "RANGE") && <Field label="Min age"><Input type="number" value={edit.ageMin ?? ""} onChange={(e) => setEdit({ ...edit, ageMin: num(e.target.value) })} /></Field>}
                {(edit.ageRuleType === "UNDER" || edit.ageRuleType === "RANGE") && <Field label={edit.ageRuleType === "UNDER" ? "Under age" : "Max age"}><Input type="number" value={edit.ageMax ?? ""} onChange={(e) => setEdit({ ...edit, ageMax: num(e.target.value) })} /></Field>}
              </div>
              <Field label="Min skill / DUPR" hint="Optional"><Input type="number" step="0.1" value={edit.skillMin ?? ""} onChange={(e) => setEdit({ ...edit, skillMin: num(e.target.value) })} /></Field>
              <Field label="Max skill / DUPR" hint="Optional"><Input type="number" step="0.1" value={edit.skillMax ?? ""} onChange={(e) => setEdit({ ...edit, skillMax: num(e.target.value) })} /></Field>
              <Field label="Badge color"><Input type="color" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} className="h-12 p-1" /></Field>
              <Field label="Icon name" hint="lucide icon, e.g. users, zap"><Input value={edit.icon} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} /></Field>
            </div>
            <h3 className="font-bold">Default scoring</h3>
            <ScoringConfigFields value={edit.scoringConfig ?? {}} onChange={(v) => setEdit({ ...edit, scoringConfig: v })} />
            <Button onClick={save}>Save category</Button>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
