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
    // Service courts (two boxes, stacked) + the non-volley zone ("kitchen") band next to the net.
    const service = (
      <div className="grid flex-1 grid-rows-2" aria-label={`${t?.name ?? side} side`}>
        {boxesFor(side, onLeft).map((b, i) => {
          const isServer = serving && b.id != null && b.id === state.serverId;
          return (
            <div
              key={i}
              className={cn("relative flex items-center justify-center p-2 text-center transition-colors duration-300", i === 0 && "border-b-2 border-white/85", big ? "min-h-28" : "min-h-20 sm:min-h-24")}
              style={{ background: b.id ? `linear-gradient(${onLeft ? 90 : 270}deg, ${color}26, ${color}0d)` : undefined }}
            >
              {b.id && (
                <motion.div layout layoutId={`p-${b.id}`} transition={{ type: "spring", stiffness: 400, damping: 32 }} className="flex flex-col items-center gap-1">
                  <span
                    className={cn(
                      "max-w-full truncate rounded-lg px-2.5 py-1 font-display font-bold uppercase leading-tight tracking-wide shadow-[0_6px_16px_-6px_rgba(0,0,0,.7)]",
                      big ? "text-xl" : "text-base sm:text-lg",
                      isServer && "ring-[3px] ring-lime ring-offset-2 ring-offset-[#1d4e7a]",
                    )}
                    style={{ background: color, color: contrastText(color) }}
                  >
                    {nameOf(players, b.id)}
                  </span>
                  {isServer && (
                    <span className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-lime">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 motion-safe:animate-glow rounded-full" aria-hidden>
                        <circle cx="8" cy="8" r="7.5" fill="#C6FF00" />
                        {[[5, 5], [11, 5], [8, 8], [5, 11], [11, 11]].map(([cx, cy]) => <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="1.1" fill="#1d4e7a" />)}
                      </svg>
                      Serving
                    </span>
                  )}
                </motion.div>
              )}
              <span className={cn("absolute bottom-1 font-display text-[10px] font-bold uppercase tracking-widest text-white/45", onLeft ? "left-1.5" : "right-1.5")}>{b.court === "RIGHT" ? "Right" : "Left"}</span>
            </div>
          );
        })}
      </div>
    );
    const kitchen = (
      <div className={cn("relative w-[18%] min-w-6 bg-white/[0.06]", onLeft ? "border-l-2" : "border-r-2", "border-white/85")} aria-hidden>
        <span className="absolute inset-0 grid place-items-center font-display text-[9px] font-bold uppercase tracking-[0.2em] text-white/30 [writing-mode:vertical-rl]">Kitchen</span>
      </div>
    );
    return <div className="flex">{onLeft ? <>{service}{kitchen}</> : <>{kitchen}{service}</>}</div>;
  };

  return (
    <div className={cn("rounded-2xl bg-[#14532d] p-2.5 shadow-card sm:p-3", className)} role="img" aria-label="Court positions">
      <div className="grid grid-cols-[1fr_auto_1fr] overflow-hidden rounded-md border-[3px] border-white/90 bg-[#1d4e7a]">
        {half(leftSide, true)}
        <div className="relative w-2.5 bg-gradient-to-b from-white/95 via-white/70 to-white/95" aria-hidden>
          <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white" />
          <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white" />
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/40" />
        </div>
        {half(rightSide, false)}
      </div>
    </div>
  );
}
