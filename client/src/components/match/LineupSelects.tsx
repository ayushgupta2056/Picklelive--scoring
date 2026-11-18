import { NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicCategory, RefLineupPlayer } from "@shared/api";
import { liveReasons, slotSize } from "./LineupPicker";

/**
 * Dropdown-per-spot lineup entry (used by the referee). The roster is the team's players uploaded once by the
 * admin; ineligible players are listed but disabled, with the reason shown in the option.
 */
export function LineupSelects({ roster, category, value, onChange, teamCode, disabled }: {
  roster: RefLineupPlayer[]; category?: PublicCategory; value: string[]; onChange: (ids: string[]) => void; teamCode?: string; disabled?: boolean;
}) {
  const need = slotSize(category);
  const set = (i: number, id: string) => {
    const next = [...value];
    while (next.length < need) next.push("");
    next[i] = id;
    onChange(next.filter((x, j) => x || j < need).slice(0, need));
  };
  return (
    <div className="grid gap-3">
      {Array.from({ length: need }, (_, i) => {
        const others = value.filter((v, j) => j !== i && v);
        return (
          <div key={i} className="grid gap-1.5">
            <Label htmlFor={`${teamCode}-p${i}`}>{teamCode} player {need > 1 ? i + 1 : ""}</Label>
            <NativeSelect id={`${teamCode}-p${i}`} value={value[i] ?? ""} disabled={disabled} onChange={(e) => set(i, e.target.value)} className="h-14 text-base" data-testid={`lineup-${teamCode}-${i}`}>
              <option value="">Select player…</option>
              {roster.map((p) => {
                const reasons = liveReasons(p, roster, others, category);
                const taken = others.includes(p.id);
                return (
                  <option key={p.id} value={p.id} disabled={reasons.length > 0 || taken}>
                    {p.jersey ? `#${p.jersey} ` : ""}{p.name} ({p.gender === "MALE" ? "M" : "F"}, {p.ageGroup}){taken ? " — already picked" : reasons.length ? ` — ${reasons.join(", ")}` : ""}
                  </option>
                );
              })}
            </NativeSelect>
          </div>
        );
      })}
    </div>
  );
}
