import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

function Segmented<T extends number>({ label, value, options, onChange, disabled, format }: { label: string; value: T; options: T[]; onChange: (v: T) => void; disabled?: boolean; format: (v: T) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-2">
      <span className="eyebrow w-16 shrink-0">{label}</span>
      <div className="inline-flex rounded-lg border bg-muted/40 p-1">
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={value === o} disabled={disabled} onClick={() => onChange(o)}
            className={cn("min-h-10 min-w-12 rounded-md px-3 text-sm font-bold transition-colors duration-150 disabled:opacity-50", value === o ? "bg-lime text-black shadow-glow" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Pick how many games (sets) a match is played over and the points per game, before the first serve.
 * Default is 1 game to 11 with side-out (serve) scoring. Saved through the match's referee endpoint
 * (accepts the referee token or the admin session).
 */
export function FormatPicker({ matchId, bestOf, pointsToWin, scoringType, headers, onSaved, disabled, compact }: {
  matchId: string; bestOf: number; pointsToWin: number; scoringType: "SIDE_OUT" | "RALLY"; headers?: Record<string, string>; onSaved?: () => void; disabled?: boolean; compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const save = async (patch: { bestOf?: number; pointsToWin?: number }) => {
    setBusy(true);
    try {
      await api.put(`/api/ref/${matchId}/format`, { bestOf, ...patch }, headers);
      toast.success(`Match set to ${(patch.bestOf ?? bestOf) === 1 ? "1 game" : `best of ${patch.bestOf ?? bestOf}`} to ${patch.pointsToWin ?? pointsToWin}`);
      onSaved?.();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cn("grid gap-2", !compact && "rounded-xl border p-3")} data-testid={`format-${matchId}`}>
      {!compact && <div className="text-sm font-semibold">Match format <span className="font-normal text-muted-foreground">· {scoringType === "RALLY" ? "rally" : "side-out (serve)"} scoring</span></div>}
      <div className={cn("flex flex-wrap gap-3", compact && "gap-2")}>
        <Segmented label="Games" value={bestOf as 1 | 3 | 5} options={[1, 3, 5]} disabled={disabled || busy} onChange={(v) => v !== bestOf && save({ bestOf: v })} format={(v) => (v === 1 ? "1" : `Bo${v}`)} />
        <Segmented label="Points" value={pointsToWin as 11 | 15 | 21} options={[11, 15, 21]} disabled={disabled || busy} onChange={(v) => v !== pointsToWin && save({ pointsToWin: v })} format={(v) => String(v)} />
      </div>
    </div>
  );
}
