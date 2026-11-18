import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
export function Logo({ className, to = "/" }: { className?: string; to?: string }) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-2 font-black tracking-tight", className)} aria-label="PickleLive home">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <circle cx="16" cy="16" r="15" fill="#C6FF00" />
        {[[11, 10], [21, 10], [16, 16], [11, 22], [21, 22]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.2" fill="#0A0A0B" />)}
      </svg>
      <span className="text-xl">Pickle<span className="text-lime-accent">Live</span></span>
    </Link>
  );
}
