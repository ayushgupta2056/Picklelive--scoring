export { ChevronRight, Loader2, LogOut, Plus } from "lucide-react";

/** Referee whistle (lucide has none). Decorative: aria-hidden. */
export function Whistle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="9" cy="14" r="6" />
      <path d="M13.5 10.5 22 6v4l-6.5 2.5" />
      <path d="M2 5l3 3M7 2l1.5 3.5" />
    </svg>
  );
}
