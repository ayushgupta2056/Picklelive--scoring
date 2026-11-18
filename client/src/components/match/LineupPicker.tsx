import { Check, Lock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicCategory, RefLineupPlayer } from "@shared/api";

export function slotSize(category?: PublicCategory) {
  return category?.format === "SINGLES" ? 1 : 2;
}

/** Reasons for a player given the current selection (adds pair-level reasons the server can't know in advance). */
export function liveReasons(p: RefLineupPlayer, roster: RefLineupPlayer[], selected: string[], category?: PublicCategory): string[] {
  const reasons = [...p.reasons];
  if (category?.genderRule === "MIXED" && !selected.includes(p.id)) {
    const others = selected.map((id) => roster.find((r) => r.id === id)).filter(Boolean) as RefLineupPlayer[];
    if (others.length === 1 && others[0].gender === p.gender) reasons.push("Mixed needs 1M + 1F");
  }
  return reasons;
}

interface Props {
  roster: RefLineupPlayer[];
  category?: PublicCategory;
  value: string[];
  onChange: (ids: string[]) => void;
  overrides?: string[];
  onOverride?: (playerId: string) => void;
  disabled?: boolean;
  big?: boolean;
}

export function LineupPicker({ roster, category, value, onChange, overrides = [], onOverride, disabled, big }: Props) {
  const need = slotSize(category);
  const toggle = (id: string) => {
    if (disabled) return;
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else if (need === 1) onChange([id]);
    else onChange([...value, id].slice(-need));
  };
  if (!roster.length) return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No players on this team's roster yet.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2" role="listbox" aria-multiselectable={need > 1}>
      {roster.map((p) => {
        const reasons = liveReasons(p, roster, value, category);
        const overridden = overrides.includes(p.id);
        const ok = reasons.length === 0 || overridden;
        const sel = value.includes(p.id);
        return (
          <li key={p.id}>
            <button
              type="button"
              role="option"
              aria-selected={sel}
              aria-disabled={!ok || disabled}
              onClick={() => (ok ? toggle(p.id) : onOverride?.(p.id))}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                big ? "min-h-16" : "min-h-14",
                sel ? "border-lime bg-lime/10" : "hover:bg-accent",
                !ok && "cursor-not-allowed opacity-50 hover:bg-transparent",
                !ok && onOverride && "cursor-pointer hover:opacity-80",
              )}
            >
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border-2", sel ? "border-lime bg-lime text-black" : "border-muted-foreground/40")}>
                {sel && <Check className="h-4 w-4" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {p.jersey && <span className="mr-1 text-muted-foreground tnum">#{p.jersey}</span>}
                  {p.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {p.gender === "MALE" ? "M" : "F"} · {p.ageGroup}
                  {overridden && <span className="ml-1 font-semibold text-amber-500">· override</span>}
                </span>
                {reasons.length > 0 && !overridden && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-destructive">
                    <ShieldAlert className="h-3 w-3" /> {reasons.join(" · ")}
                  </span>
                )}
              </span>
              {disabled && <Lock className="h-4 w-4 text-muted-foreground" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
