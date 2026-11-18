import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn, contrastText } from "@/lib/utils";
import type { MatchStatus, PublicCategory, PublicTeam } from "@shared/api";

export function TeamChip({ team, size = "md", className }: { team?: PublicTeam | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const color = team?.color ?? "#52525B";
  const s = size === "sm" ? "h-6 min-w-9 text-[13px] px-1.5" : size === "lg" ? "h-10 min-w-14 text-xl px-2.5" : "h-7 min-w-11 text-sm px-2";
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-md font-display font-bold uppercase tracking-wide tnum shadow-[inset_0_-2px_0_rgba(0,0,0,.18)]", s, className)}
      style={{ background: color, color: contrastText(color) }}
    >
      {team?.code ?? "TBD"}
    </span>
  );
}

export function TeamLogo({ team, className }: { team?: PublicTeam | null; className?: string }) {
  if (team?.logoUrl) return <img src={team.logoUrl} alt="" className={cn("h-10 w-10 rounded-lg object-cover", className)} />;
  const color = team?.color ?? "#52525B";
  return (
    <span className={cn("grid h-10 w-10 place-items-center rounded-lg text-sm font-black", className)} style={{ background: color, color: contrastText(color) }} aria-hidden>
      {team?.code?.slice(0, 3) ?? "?"}
    </span>
  );
}

export function CategoryBadge({ category, className, long }: { category?: PublicCategory; className?: string; long?: boolean }) {
  if (!category) return null;
  return (
    <span
      className={cn("inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 font-display text-[12px] font-bold uppercase tracking-wider", className)}
      style={{ background: `${category.color}26`, color: category.color, boxShadow: `inset 0 0 0 1px ${category.color}55` }}
      title={category.name}
    >
      {long ? category.name : category.code}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5", className)} aria-hidden>
      <span className="absolute inset-0 rounded-full bg-live opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-block h-full w-full rounded-full bg-live" />
    </span>
  );
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  SCHEDULED: "Upcoming",
  LINEUP: "Lineups in",
  LIVE: "Live",
  PAUSED: "Paused",
  FINISHED: "Final",
  WALKOVER: "Walkover",
  RETIRED: "Retired",
  NOT_REQUIRED: "Not required",
};
export function StatusPill({ status, className }: { status: MatchStatus; className?: string }) {
  const live = status === "LIVE";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em]",
        live ? "bg-live/15 text-live" : status === "PAUSED" ? "bg-amber-500/15 text-amber-500" : ["FINISHED", "WALKOVER", "RETIRED"].includes(status) ? "bg-secondary text-foreground" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {live && <LiveDot className="h-2 w-2" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

/** A number that animates when it changes. */
export function AnimatedNumber({ value, className }: { value: number | string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className={cn("relative inline-flex overflow-hidden tnum", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          initial={reduce ? false : { y: "-60%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: "60%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/40 p-10 text-center">
      {icon && <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">{icon}</div>}
      <p className="font-display text-xl font-bold uppercase tracking-wide">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
