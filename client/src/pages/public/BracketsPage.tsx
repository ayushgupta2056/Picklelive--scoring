import { Link } from "react-router-dom";
import { GitBranch, Trophy } from "lucide-react";
import { useT } from "@/components/public/context";
import { EmptyState, LiveDot, TeamChip } from "@/components/match/bits";
import { cn } from "@/lib/utils";
import type { TieSummary } from "@shared/api";
import { PageTitle } from "./PublicRoutes";

const SLOT = 132; // px height of one first-round slot

function BracketTie({ t }: { t: TieSummary }) {
  const { lk, base } = useT();
  const live = t.matches.some((m) => m.status === "LIVE");
  const row = (side: "A" | "B") => {
    const team = lk.teams.get((side === "A" ? t.teamAId : t.teamBId) ?? "");
    const win = t.winner === side;
    return (
      <div className={cn("flex h-10 items-center gap-2 px-2.5", t.winner && !win && "opacity-45", win && "bg-lime/[0.07]")}>
        <TeamChip team={team} size="sm" />
        <span className={cn("min-w-0 flex-1 truncate text-sm", win ? "font-bold" : "font-medium", !team && "italic text-muted-foreground")}>{team?.name ?? "TBD"}</span>
        <span className={cn("w-6 text-right font-display text-xl font-bold tnum", win && "text-lime-accent")}>{t.status === "SCHEDULED" ? "" : side === "A" ? t.scoreA : t.scoreB}</span>
      </div>
    );
  };
  return (
    <Link to={`${base}/tie/${t.id}`} aria-label={`${t.roundLabel}: ${lk.teams.get(t.teamAId ?? "")?.name ?? "TBD"} vs ${lk.teams.get(t.teamBId ?? "")?.name ?? "TBD"}`}
      className={cn("surface hover-lift block w-60 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", live && "surface-live")}>
      <div className="flex h-6 items-center gap-1.5 border-b border-border/60 px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {live && <LiveDot className="h-2 w-2" />}{live ? <span className="text-live">Live</span> : t.status === "FINISHED" ? "Final" : t.status === "SCHEDULED" ? "Upcoming" : "In progress"}
      </div>
      {row("A")}
      <div className="h-px bg-border/60" />
      {row("B")}
    </Link>
  );
}

function Placeholder({ label }: { label: string }) {
  return <div className="grid h-[86px] w-60 place-items-center rounded-2xl border border-dashed text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>;
}

/**
 * Knockout tree: each round is a column whose ties are vertically centred between the two ties that feed them.
 * Pairs are joined by connector lines drawn with borders.
 */
function Tree({ ties }: { ties: TieSummary[] }) {
  const rounds = Math.max(...ties.map((t) => t.round));
  const firstRound = Math.min(...ties.map((t) => t.round));
  const cols = Array.from({ length: rounds - firstRound + 1 }, (_, i) => firstRound + i);
  const size = (r: number) => 2 ** (rounds - r);
  const height = size(firstRound) * SLOT;
  const label = (r: number) => ties.find((t) => t.round === r)?.roundLabel ?? `Round ${r}`;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 [scrollbar-width:thin]" tabIndex={0} aria-label="Bracket (scroll horizontally)">
      <div className="flex min-w-max gap-10">
        {cols.map((r) => {
          const n = size(r);
          const slots = Array.from({ length: n }, (_, pos) => ties.find((t) => t.round === r && t.bracketPos === pos) ?? null);
          const pairs = r === rounds ? [slots] : Array.from({ length: n / 2 }, (_, i) => slots.slice(i * 2, i * 2 + 2));
          return (
            <div key={r} className="flex flex-col">
              <h3 className="mb-3 flex h-6 items-center gap-1.5 font-display text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {r === rounds && <Trophy className="h-4 w-4 text-lime-accent" aria-hidden />}{label(r)}
              </h3>
              <div className="flex flex-col" style={{ height }}>
                {pairs.map((pair, pi) => (
                  <div key={pi} className="relative flex flex-1 flex-col justify-around">
                    {pair.map((t, k) => (
                      <div key={k} className="relative flex items-center">
                        {r > firstRound && <span aria-hidden className="absolute -left-5 top-1/2 h-px w-5 bg-border" />}
                        {t ? <BracketTie t={t} /> : <Placeholder label={r === firstRound ? "Bye" : "TBD"} />}
                        {r < rounds && <span aria-hidden className="absolute -right-5 top-1/2 h-px w-5 bg-border" />}
                      </div>
                    ))}
                    {r < rounds && pair.length === 2 && (
                      <>
                        <span aria-hidden className="absolute -right-5 top-1/4 h-1/2 w-px bg-border" />
                        <span aria-hidden className="absolute -right-10 top-1/2 h-px w-5 bg-border" />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BracketsPage() {
  const { b, lk } = useT();
  const ko = b.stages.filter((s) => s.type === "KNOCKOUT");
  if (!ko.length) return (<><PageTitle eyebrow="Knockout" title="Brackets" /><EmptyState icon={<GitBranch className="h-7 w-7" />} title="No knockout stage yet" /></>);
  return (
    <div className="space-y-10">
      <PageTitle eyebrow="Knockout" title="Brackets" />
      {ko.map((s) => {
        const ties = b.ties.filter((t) => t.stageId === s.id);
        const third = ties.filter((t) => t.roundLabel === "3rd place");
        const main = ties.filter((t) => t.roundLabel !== "3rd place");
        const final = main.length ? main.reduce((a, c) => (c.round > a.round ? c : a)) : null;
        const champion = final?.status === "FINISHED" && (final.winner === "A" || final.winner === "B") ? lk.teams.get((final.winner === "A" ? final.teamAId : final.teamBId) ?? "") : null;
        const seeds = (s.settings.seedTeamIds ?? []).map((id) => lk.teams.get(id)).filter(Boolean);
        return (
          <section key={s.id} aria-labelledby={`ko-${s.id}`}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 id={`ko-${s.id}`} className="font-display text-2xl font-bold uppercase tracking-wide">{s.name}</h2>
              {champion && (
                <span className="inline-flex items-center gap-2 rounded-full bg-lime/15 px-3 py-1 text-sm font-bold text-lime-accent ring-1 ring-lime/30">
                  <Trophy className="h-4 w-4" aria-hidden /> Champions: {champion.name}
                </span>
              )}
            </div>
            {!main.length ? (
              <div className="surface relative overflow-hidden p-6 sm:p-10">
                <svg aria-hidden viewBox="0 0 400 160" className="pointer-events-none absolute right-0 top-1/2 hidden h-48 -translate-y-1/2 opacity-[0.12] sm:block">
                  <g fill="none" stroke="#C6FF00" strokeWidth="2">
                    {[20, 60, 100, 140].map((y) => <rect key={y} x="10" y={y - 12} width="90" height="24" rx="6" />)}
                    {[40, 120].map((y) => <rect key={y} x="160" y={y - 12} width="90" height="24" rx="6" />)}
                    <rect x="310" y="68" width="80" height="24" rx="6" />
                    <path d="M100 20h30v40h-30M130 40h30M100 100h30v40h-30M130 120h30M250 40h30v80h-30M280 80h30" />
                  </g>
                </svg>
                <div className="relative max-w-md">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-lime/10 text-lime-accent ring-1 ring-lime/25"><GitBranch className="h-6 w-6" aria-hidden /></span>
                  <h3 className="mt-4 font-display text-2xl font-bold uppercase tracking-wide">Bracket not drawn yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">It fills in automatically once the group stage finishes and the knockout is seeded. Follow the race on the standings page.</p>
                  {seeds.length > 0 && <p className="mt-3 text-sm">Seeds: {seeds.map((t) => t!.code).join(" · ")}</p>}
                </div>
              </div>
            ) : (
              <>
                <Tree ties={main} />
                {third.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">3rd place</h3>
                    <div className="flex flex-wrap gap-4">{third.map((t) => <BracketTie key={t.id} t={t} />)}</div>
                  </div>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
