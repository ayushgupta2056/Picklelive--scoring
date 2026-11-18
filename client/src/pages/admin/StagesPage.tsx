import { useEffect, useState } from "react";
import { Plus, Shuffle, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SortableList } from "@/components/Sortable";
import { EmptyState, TeamChip } from "@/components/match/bits";
import { api } from "@/lib/api";
import { useA, useAct } from "./data";
import type { AStage } from "./types";
import { ConfirmButton, PageHeader } from "./ui";

export default function StagesPage() {
  const { t, tid } = useA();
  const act = useAct();
  const [name, setName] = useState("");
  const [type, setType] = useState<AStage["type"]>("ROUND_ROBIN");
  return (
    <div>
      <PageHeader title="Stages" description="Round-robin groups → knockout, pure round robin, or pure knockout. Generating creates every tie, and each tie gets one match per category slot.">
      </PageHeader>
      <Card className="mb-5 flex flex-wrap items-end gap-2 p-3">
        <Field label="New stage name" className="min-w-48 flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group Stage" /></Field>
        <Field label="Type"><NativeSelect value={type} onChange={(e) => setType(e.target.value as AStage["type"])}><option value="ROUND_ROBIN">Round robin (groups)</option><option value="KNOCKOUT">Knockout</option></NativeSelect></Field>
        <Button disabled={!name.trim()} onClick={async () => { if (await act(() => api.post(`/api/admin/tournaments/${tid}/stages`, { name, type, templateId: t.defaultTemplateId, settings: type === "KNOCKOUT" ? { thirdPlace: true, seedTeamIds: [] } : { qualifiersPerGroup: 2 } }), "Stage added")) setName(""); }}><Plus /> Add stage</Button>
      </Card>
      {!t.stages.length && <EmptyState title="No stages yet" />}
      <div className="grid gap-5">
        {t.stages.map((s) => (s.type === "ROUND_ROBIN" ? <RRStage key={s.id} s={s} /> : <KOStage key={s.id} s={s} />))}
      </div>
    </div>
  );
}

function StageHead({ s }: { s: AStage }) {
  const { t, b } = useA();
  const act = useAct();
  const ties = b.ties.filter((x) => x.stageId === s.id).length;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h2 className="text-lg font-bold">{s.name}</h2>
      <span className="rounded bg-muted px-2 py-0.5 text-xs font-bold">{s.type === "ROUND_ROBIN" ? "Round robin" : "Knockout"}</span>
      <span className="text-sm text-muted-foreground">{ties} ties</span>
      <div className="ml-auto flex items-center gap-2">
        <NativeSelect aria-label="Tie format" className="h-10 w-56" value={s.templateId ?? ""} onChange={(e) => act(() => api.patch(`/api/admin/stages/${s.id}`, { templateId: e.target.value || null }), "Format updated")}>
          <option value="">Tournament default format</option>
          {t.templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
        </NativeSelect>
        <ConfirmButton variant="ghost" size="icon" aria-label="Delete stage" title={`Delete ${s.name}?`} description="All of its ties (not yet scored) are deleted too." confirmLabel="Delete" onConfirm={() => act(() => api.del(`/api/admin/stages/${s.id}`), "Stage deleted")}><Trash2 /></ConfirmButton>
      </div>
    </div>
  );
}

function RRStage({ s }: { s: AStage }) {
  const { t, lk } = useA();
  const act = useAct();
  const [groups, setGroups] = useState(() => s.groups.map((g) => ({ id: g.id, name: g.name, teamIds: [...g.teams].sort((a, c) => a.seed - c.seed).map((x) => x.teamId) })));
  useEffect(() => setGroups(s.groups.map((g) => ({ id: g.id, name: g.name, teamIds: [...g.teams].sort((a, c) => a.seed - c.seed).map((x) => x.teamId) }))), [s.groups]);
  const assigned = new Set(groups.flatMap((g) => g.teamIds));
  const unassigned = t.teams.filter((x) => !assigned.has(x.id));
  const saveGroups = (gs = groups) => act(() => api.put(`/api/admin/stages/${s.id}/groups`, gs), "Groups saved");
  const autoSplit = () => {
    const n = Math.max(1, groups.length || 2);
    const gs = Array.from({ length: n }, (_, i) => ({ id: groups[i]?.id, name: groups[i]?.name ?? `Group ${String.fromCharCode(65 + i)}`, teamIds: [] as string[] }));
    t.teams.forEach((tm, i) => gs[Math.floor(i / Math.ceil(t.teams.length / n))]?.teamIds.push(tm.id));
    setGroups(gs);
  };
  return (
    <Card className="p-4">
      <StageHead s={s} />
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Field label="Qualifiers per group"><Input type="number" min={1} className="w-24" defaultValue={s.settings.qualifiersPerGroup ?? 2} onBlur={(e) => act(() => api.patch(`/api/admin/stages/${s.id}`, { settings: { qualifiersPerGroup: Number(e.target.value) || 1 } }))} /></Field>
        <Switch label="Double round robin" checked={!!s.settings.doubleRoundRobin} onCheckedChange={(v) => act(() => api.patch(`/api/admin/stages/${s.id}`, { settings: { doubleRoundRobin: v } }))} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g, gi) => (
          <div key={g.id ?? gi} className="rounded-xl border p-3">
            <div className="mb-2 flex items-center gap-2">
              <Input className="h-10 font-bold" value={g.name} onChange={(e) => setGroups(groups.map((x, i) => (i === gi ? { ...x, name: e.target.value } : x)))} aria-label="Group name" />
              <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Remove group" onClick={() => setGroups(groups.filter((_, i) => i !== gi))}><X /></Button>
            </div>
            <ul className="grid gap-1">
              {g.teamIds.map((id) => (
                <li key={id} className="flex items-center gap-2 text-sm"><TeamChip team={lk.teams.get(id)} size="sm" /> {lk.teams.get(id)?.name}
                  <button className="ml-auto grid h-8 w-8 place-items-center rounded hover:bg-accent" aria-label="Remove team" onClick={() => setGroups(groups.map((x, i) => (i === gi ? { ...x, teamIds: x.teamIds.filter((y) => y !== id) } : x)))}><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
            {unassigned.length > 0 && (
              <NativeSelect className="mt-2 h-10" value="" aria-label="Add team" onChange={(e) => e.target.value && setGroups(groups.map((x, i) => (i === gi ? { ...x, teamIds: [...x.teamIds, e.target.value] } : x)))}>
                <option value="">+ Add team…</option>
                {unassigned.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </NativeSelect>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setGroups([...groups, { id: undefined as unknown as string, name: `Group ${String.fromCharCode(65 + groups.length)}`, teamIds: [] }])}><Plus /> Add group</Button>
        <Button variant="outline" onClick={autoSplit} disabled={!t.teams.length}><Shuffle /> Split teams evenly</Button>
        <Button variant="secondary" onClick={() => saveGroups()}>Save groups</Button>
        <ConfirmButton title="Generate round-robin ties?" description="Creates every pairing in each group (circle method). Existing unplayed ties in this stage are replaced." confirmLabel="Generate"
          onConfirm={async () => { await saveGroups(); await act(() => api.post(`/api/admin/stages/${s.id}/generate`), "Ties generated"); }}>
          <Wand2 /> Generate ties
        </ConfirmButton>
      </div>
    </Card>
  );
}

function KOStage({ s }: { s: AStage }) {
  const { t, lk } = useA();
  const act = useAct();
  const [seeds, setSeeds] = useState<string[]>(s.settings.seedTeamIds ?? []);
  useEffect(() => setSeeds(s.settings.seedTeamIds ?? []), [s.settings.seedTeamIds]);
  const rrStages = t.stages.filter((x) => x.type === "ROUND_ROBIN");
  const [from, setFrom] = useState(rrStages[0]?.id ?? "");
  const unseeded = t.teams.filter((x) => !seeds.includes(x.id));
  return (
    <Card className="p-4">
      <StageHead s={s} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold">Seeds <span className="font-normal text-muted-foreground">(drag to reseed; 1 v lowest, byes go to top seeds)</span></h3>
          {seeds.length === 0 && <p className="mb-2 text-sm text-muted-foreground">No seeds yet: fill from group standings or add teams manually.</p>}
          <SortableList items={seeds} getId={(x) => x} onChange={setSeeds} render={(id, i) => (
            <div className="flex items-center gap-2 text-sm"><span className="w-6 font-black tnum">{i + 1}</span><TeamChip team={lk.teams.get(id)} size="sm" /> {lk.teams.get(id)?.name}
              <button className="ml-auto grid h-9 w-9 place-items-center rounded hover:bg-accent" aria-label="Remove seed" onClick={() => setSeeds(seeds.filter((x) => x !== id))}><X className="h-4 w-4" /></button>
            </div>
          )} />
          {unseeded.length > 0 && (
            <NativeSelect className="mt-2 h-10" value="" aria-label="Add seed" onChange={(e) => e.target.value && setSeeds([...seeds, e.target.value])}>
              <option value="">+ Add team…</option>
              {unseeded.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </NativeSelect>
          )}
        </div>
        <div className="space-y-3">
          <Switch label="Play a 3rd-place tie" checked={s.settings.thirdPlace !== false} onCheckedChange={(v) => act(() => api.patch(`/api/admin/stages/${s.id}`, { settings: { thirdPlace: v } }))} />
          {rrStages.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Fill from standings of"><NativeSelect value={from} onChange={(e) => setFrom(e.target.value)}>{rrStages.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</NativeSelect></Field>
              <ConfirmButton variant="outline" title="Fill bracket from standings?" description="Takes the qualifiers from each group (A1 v B2, B1 v A2 …) and generates the bracket." confirmLabel="Fill & generate"
                onConfirm={() => act(() => api.post(`/api/admin/stages/${s.id}/fill`, { fromStageId: from }), "Bracket filled")}>Fill from standings</ConfirmButton>
            </div>
          )}
          <ConfirmButton disabled={seeds.length < 2} title="Generate the bracket?" description="Creates all knockout ties (QF/SF/Final + 3rd place) from the seed order. Unplayed ties in this stage are replaced." confirmLabel="Generate"
            onConfirm={() => act(() => api.put(`/api/admin/stages/${s.id}/seeds`, { teamIds: seeds, regenerate: true }), "Bracket generated")}>
            <Wand2 /> Save seeds & generate bracket
          </ConfirmButton>
        </div>
      </div>
    </Card>
  );
}
