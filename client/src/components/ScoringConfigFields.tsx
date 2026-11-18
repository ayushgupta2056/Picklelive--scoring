import { Field } from "@/components/ui/label";
import { NativeSelect, Input } from "@/components/ui/input";
import type { MatchConfig } from "@shared/scoring/types";

/** Editor for a partial scoring config (category default or per-match override). Blank = inherit/default. */
export function ScoringConfigFields({ value, onChange }: { value: Partial<MatchConfig>; onChange: (v: Partial<MatchConfig>) => void }) {
  const set = <K extends keyof MatchConfig>(k: K, v: MatchConfig[K] | undefined) => {
    const next = { ...value };
    if (v === undefined) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  const optNum = (s: string) => (s === "" ? undefined : Number(s));
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Field label="Scoring">
        <NativeSelect value={value.scoringType ?? ""} onChange={(e) => set("scoringType", (e.target.value || undefined) as MatchConfig["scoringType"])}>
          <option value="">Default (side-out)</option><option value="SIDE_OUT">Side-out</option><option value="RALLY">Rally</option>
        </NativeSelect>
      </Field>
      <Field label="Points to win">
        <NativeSelect value={value.pointsToWin ?? ""} onChange={(e) => set("pointsToWin", optNum(e.target.value) as MatchConfig["pointsToWin"])}>
          <option value="">Default (11)</option><option value="11">11</option><option value="15">15</option><option value="21">21</option>
        </NativeSelect>
      </Field>
      <Field label="Best of">
        <NativeSelect value={value.bestOf ?? ""} onChange={(e) => set("bestOf", optNum(e.target.value) as MatchConfig["bestOf"])}>
          <option value="">Default (3)</option><option value="1">1</option><option value="3">3</option><option value="5">5</option>
        </NativeSelect>
      </Field>
      <Field label="Win by"><Input type="number" min={1} max={2} placeholder="2" value={value.winBy ?? ""} onChange={(e) => set("winBy", optNum(e.target.value))} /></Field>
      <Field label="Point cap" hint="Blank = no cap"><Input type="number" min={1} max={50} value={value.pointCap ?? ""} onChange={(e) => set("pointCap", e.target.value === "" ? undefined : Number(e.target.value))} /></Field>
      <Field label="Timeouts / game" hint="Default 2 (3 for 21)"><Input type="number" min={0} max={5} value={value.timeoutsPerGame ?? ""} onChange={(e) => set("timeoutsPerGame", optNum(e.target.value))} /></Field>
      <Field label="Switch ends at" hint="Deciding game; default 6/8/11"><Input type="number" min={1} max={30} value={value.switchEndsAt ?? ""} onChange={(e) => set("switchEndsAt", optNum(e.target.value))} /></Field>
      <Field label="Timeout seconds"><Input type="number" min={10} max={300} placeholder="60" value={value.timeoutSeconds ?? ""} onChange={(e) => set("timeoutSeconds", optNum(e.target.value))} /></Field>
    </div>
  );
}
