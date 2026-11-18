import { useId } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** The PickleLive ball mark (decorative). */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8 shrink-0", className)} aria-hidden>
      <defs>
        <radialGradient id={`ball-${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#E4FF66" />
          <stop offset="60%" stopColor="#C6FF00" />
          <stop offset="100%" stopColor="#8FBF00" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#ball-${id})`} />
      {[[11, 10], [21, 10], [16, 16], [11, 22], [21, 22]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.2" fill="#0A0A0B" />)}
    </svg>
  );
}

export function Logo({ className, to = "/" }: { className?: string; to?: string }) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} aria-label="PickleLive home">
      <LogoMark />
      <span className="font-display text-2xl font-bold uppercase leading-none tracking-wide">Pickle<span className="text-lime-accent">Live</span></span>
    </Link>
  );
}
