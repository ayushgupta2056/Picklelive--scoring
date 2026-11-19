import { useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicCategory, RefLineupPlayer } from "@shared/api";
import { liveReasons, slotSize } from "./LineupPicker";

/**
 * Type-to-search player picker for referees: start typing ("a") and every matching player of the team shows
 * up. Ineligible players stay visible but can't be picked, with the reason. One box per player spot.
 * Accessible combobox (arrow keys + Enter, Esc closes).
 */
function PlayerBox({ roster, category, others, value, onChange, label, testId }: {
  roster: RefLineupPlayer[];
  category?: PublicCategory;
  others: string[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  testId: string;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const chosen = roster.find((p) => p.id === value);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return roster
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.jersey ?? "") === needle)
      .map((p) => {
        const reasons = others.includes(p.id) ? ["already picked"] : liveReasons(p, roster, others, category);
        return { p, reasons, ok: reasons.length === 0 };
      })
      .sort((a, b) => Number(b.ok) - Number(a.ok) || a.p.name.localeCompare(b.p.name));
  }, [roster, q, others, category]);

  const pick = (pid: string) => {
    onChange(pid);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">{label}</label>
      {chosen && !open ? (
        <div className="flex h-14 items-center gap-2 rounded-xl border-2 border-lime bg-lime/10 px-3" data-testid={`${testId}-chosen`}>
          <span className="min-w-0 flex-1 truncate text-lg font-bold">{chosen.name}</span>
          <span className="text-xs text-muted-foreground">{chosen.gender === "MALE" ? "M" : "F"} · {chosen.ageGroup}</span>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-accent" aria-label={`Change ${label}`} onClick={() => { onChange(""); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}>
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            id={id}
            data-testid={testId}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder="Type a name…"
            value={q}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
            onKeyDown={(e) => {
              const enabled = list.filter((x) => x.ok);
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, enabled.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter" && enabled[active]) { e.preventDefault(); pick(enabled[active].p.id); }
              if (e.key === "Escape") setOpen(false);
            }}
            className="h-14 w-full rounded-xl border-2 border-input bg-background pl-11 pr-3 text-lg focus-visible:border-lime focus-visible:outline-none"
          />
        </div>
      )}
      {open && (
        <ul id={`${id}-list`} role="listbox" aria-label={label} className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-2xl">
          {list.length === 0 && <li className="p-3 text-sm text-muted-foreground">No player matches “{q}”.</li>}
          {list.map(({ p, reasons, ok }) => {
            const enabledIdx = list.filter((x) => x.ok).findIndex((x) => x.p.id === p.id);
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={value === p.id}
                aria-disabled={!ok}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ok && pick(p.id)}
                className={cn("flex min-h-12 cursor-pointer items-center gap-2 rounded-lg px-3 py-2", ok ? "hover:bg-accent" : "cursor-not-allowed opacity-50", ok && enabledIdx === active && "bg-accent")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.jersey && <span className="mr-1 text-muted-foreground">#{p.jersey}</span>}{p.name}</span>
                  {!ok && <span className="block text-xs font-medium text-destructive">{reasons.join(" · ")}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{p.gender === "MALE" ? "M" : "F"} · {p.ageGroup}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One search box per player spot (2 for doubles, 1 for singles). */
export function PlayerSearch({ roster, category, value, onChange, teamCode }: {
  roster: RefLineupPlayer[];
  category?: PublicCategory;
  value: string[];
  onChange: (ids: string[]) => void;
  teamCode?: string;
}) {
  const need = slotSize(category);
  return (
    <div className="grid gap-3">
      {Array.from({ length: need }, (_, i) => (
        <PlayerBox
          key={i}
          roster={roster}
          category={category}
          others={value.filter((v, j) => j !== i && v)}
          value={value[i] ?? ""}
          label={need > 1 ? `Player ${i + 1}` : "Player"}
          testId={`player-${teamCode}-${i}`}
          onChange={(pid) => {
            const next = [...value];
            while (next.length < need) next.push("");
            next[i] = pid;
            onChange(next.slice(0, need));
          }}
        />
      ))}
    </div>
  );
}
