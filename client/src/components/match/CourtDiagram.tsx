import { motion } from "framer-motion";
import { cn, contrastText } from "@/lib/utils";
import type { MatchState, Side } from "@shared/scoring/types";
import type { PublicPlayer, PublicTeam } from "@shared/api";

interface Props {
  state: MatchState;
  teamA?: PublicTeam | null;
  teamB?: PublicTeam | null;
  players: Map<string, PublicPlayer> | Record<string, PublicPlayer>;
  className?: string;
  big?: boolean;
}

const nameOf = (players: Props["players"], id: string | null) => {
  if (!id) return "";
  const p = players instanceof Map ? players.get(id) : players[id];
  return p?.name ?? "Player";
};

/**
 * Top-down court seen from the referee's chair at the net post: the net runs vertically, each team occupies its
 * own column. The team at the "NEAR" end is drawn on the LEFT, the other team on the RIGHT (matching the rally
 * buttons below). A team on the left faces right, so its right-hand court is the BOTTOM box; a team on the right
 * faces left, so its right-hand court is the TOP box.
 */
export function CourtDiagram({ state, teamA, teamB, players, className, big }: Props) {
  const leftSide: Side = state.ends.A === "NEAR" ? "A" : "B";
  const rightSide: Side = leftSide === "A" ? "B" : "A";
  const team = (s: Side) => (s === "A" ? teamA : teamB);
  const doubles = state.config.format === "DOUBLES";

  const boxesFor = (side: Side, onLeft: boolean) => {
    const pos = state.positions[side];
    let right: string | null = pos.right;
    let left: string | null = pos.left;
    if (!doubles) {
      // Singles: both players stand in the court matching the serving score parity.
      const inRight = state.serveCourt === "RIGHT";
      right = inRight ? pos.right : null;
      left = inRight ? null : pos.right;
    }
    // [top, bottom]
    return onLeft ? [{ id: left, court: "LEFT" }, { id: right, court: "RIGHT" }] : [{ id: right, court: "RIGHT" }, { id: left, court: "LEFT" }];
  };

  const half = (side: Side, onLeft: boolean) => {
    const t = team(side);
    const color = t?.color ?? "#3F3F46";
    const serving = state.servingTeam === side && state.phase !== "FINISHED" && state.phase !== "NOT_STARTED";
    return (
      <div className="grid grid-rows-2" aria-label={`${t?.name ?? side} side`}>
        {boxesFor(side, onLeft).map((b, i) => {
          const isServer = serving && b.id != null && b.id === state.serverId;
          return (
            <div
              key={i}
              className={cn("relative flex items-center justify-center p-2 text-center", i === 0 && "border-b-2 border-white/60", big ? "min-h-28" : "min-h-20 sm:min-h-24")}
              style={{ background: `${color}${b.id ? "33" : "14"}` }}
            >
              {b.id && (
                <motion.div layout layoutId={`p-${b.id}`} transition={{ type: "spring", stiffness: 400, damping: 32 }} className="flex flex-col items-center gap-1">
                  <span
                    className={cn("rounded-lg px-2 py-1 font-bold leading-tight shadow", big ? "text-lg" : "text-sm sm:text-base", isServer && "ring-4 ring-lime")}
                    style={{ background: color, color: contrastText(color) }}
                  >
                    {nameOf(players, b.id)}
                  </span>
                  {isServer && (
                    <span className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-lime">
                      <span className="inline-block h-3.5 w-3.5 rounded-full bg-lime animate-glow" aria-hidden /> Serving
                    </span>
                  )}
                </motion.div>
              )}
              <span className={cn("absolute bottom-1 text-[9px] font-bold uppercase tracking-widest text-white/40", onLeft ? "left-1.5" : "right-1.5")}>{b.court === "RIGHT" ? "R" : "L"}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={cn("grid grid-cols-[1fr_auto_1fr] overflow-hidden rounded-xl border-4 border-white/80 bg-[#14532d]", className)} role="img" aria-label="Court positions">
      {half(leftSide, true)}
      <div className="relative w-3 bg-white/90" aria-hidden>
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/40" />
      </div>
      {half(rightSide, false)}
    </div>
  );
}
