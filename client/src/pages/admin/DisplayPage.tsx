import { useState } from "react";
import { ExternalLink, Monitor, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { QrDialog } from "@/components/public/Share";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { DisplaySettings } from "@shared/api";
import { pagesFor } from "../public/TvPage";
import { useA, useAct } from "./data";
import { PageHeader } from "./ui";

const MODES: { mode: DisplaySettings["mode"]; title: string; desc: string }[] = [
  { mode: "ALL", title: "All live ties", desc: "Every Team A vs Team B tie in progress with all its category matches, courts and player photos. Layout grows/shrinks with the number of ties." },
  { mode: "TEAM", title: "One team", desc: "A single team's current tie (or its next one)." },
  { mode: "TIE", title: "One tie", desc: "Feature one specific tie full-screen." },
  { mode: "ROTATE", title: "Rotate live ties", desc: "Each live tie full-screen in turn." },
];

/** Controls what the big screen at /t/:slug/tv shows. Changes are pushed live to every open TV. */
export default function DisplayPage() {
  const { t, tid, b, lk } = useA();
  const act = useAct();
  const cur: DisplaySettings = { mode: "ALL", rotateSeconds: 12, showPhotos: true, ...(t.settings.display ?? {}) };
  const [qr, setQr] = useState(false);
  const save = (d: Partial<DisplaySettings>) => act(() => api.patch(`/api/admin/tournaments/${tid}`, { settings: { display: { ...cur, ...d } } }), "Display updated");
  const url = new URL(`/t/${t.slug}/tv`, window.location.origin).toString();
  const preview = pagesFor(b, cur);
  return (
    <div>
      <PageHeader title="Big display" description="Open the TV link on the venue screen once, then switch what it shows from here. It updates instantly.">
        <Button variant="outline" onClick={() => setQr(true)}><QrCode /> TV link</Button>
        <Button asChild><a href={`/t/${t.slug}/tv`} target="_blank" rel="noreferrer"><ExternalLink /> Open TV screen</a></Button>
      </PageHeader>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {MODES.map((m) => (
          <button key={m.mode} onClick={() => save({ mode: m.mode })} aria-pressed={cur.mode === m.mode}
            className={cn("rounded-xl border-2 p-4 text-left transition-colors", cur.mode === m.mode ? "border-lime bg-lime/10" : "hover:bg-accent")}>
            <Monitor className="mb-2 h-6 w-6" />
            <div className="font-bold">{m.title}</div>
            <div className="text-sm text-muted-foreground">{m.desc}</div>
          </button>
        ))}
      </div>
      <Card className="mt-4 grid gap-4 p-4 md:grid-cols-3">
        {cur.mode === "TEAM" && (
          <Field label="Team"><NativeSelect value={cur.teamId ?? ""} onChange={(e) => save({ teamId: e.target.value || null })}><option value="">Pick a team…</option>{t.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect></Field>
        )}
        {cur.mode === "TIE" && (
          <Field label="Tie"><NativeSelect value={cur.tieId ?? ""} onChange={(e) => save({ tieId: e.target.value || null })}><option value="">Pick a tie…</option>{b.ties.filter((x) => x.teamAId && x.teamBId).map((x) => <option key={x.id} value={x.id}>{lk.teams.get(x.teamAId!)?.code} v {lk.teams.get(x.teamBId!)?.code} · {x.roundLabel} ({x.status.toLowerCase()})</option>)}</NativeSelect></Field>
        )}
        <Field label="Seconds per page (when paging/rotating)"><Input type="number" min={5} max={120} defaultValue={cur.rotateSeconds} onBlur={(e) => save({ rotateSeconds: Number(e.target.value) || 12 })} /></Field>
        <Switch label="Show player photos" checked={cur.showPhotos !== false} onCheckedChange={(v) => save({ showPhotos: v })} />
      </Card>
      <p className="mt-4 text-sm text-muted-foreground">Currently on screen: <b className="text-foreground">{preview.length ? preview.map((x) => `${lk.teams.get(x.teamAId!)?.code} v ${lk.teams.get(x.teamBId!)?.code}`).join(", ") : "nothing live (shows upcoming ties)"}</b>. You can also force a view on a specific screen with <code>?team=…</code> or <code>?tie=…</code> in the TV URL.</p>
      <QrDialog open={qr} onOpenChange={setQr} url={url} title="TV display link" />
    </div>
  );
}
