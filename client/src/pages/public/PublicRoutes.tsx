import { lazy, Suspense, useEffect } from "react";
import { Link, NavLink, Route, Routes, useLocation, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, GitBranch, Home, ListOrdered, MapPin, Medal, Moon, Sun, Tv, Users, UserRound, WifiOff } from "lucide-react";
import { useBundle, useLookups } from "@/hooks/useBundle";
import { useTheme } from "@/hooks/useTheme";
import { useSocketStatus } from "@/lib/socket";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareButton } from "@/components/public/Share";
import { TournamentContext } from "@/components/public/context";
import type { TournamentBundle } from "@shared/api";

const LiveHome = lazy(() => import("./LiveHome"));
const SchedulePage = lazy(() => import("./SchedulePage"));
const StandingsPage = lazy(() => import("./StandingsPage"));
const BracketsPage = lazy(() => import("./BracketsPage"));
const TeamsPage = lazy(() => import("./TeamsPage").then((m) => ({ default: m.TeamsPage })));
const TeamPage = lazy(() => import("./TeamsPage").then((m) => ({ default: m.TeamPage })));
const PlayersPage = lazy(() => import("./PlayersPage").then((m) => ({ default: m.PlayersPage })));
const PlayerPage = lazy(() => import("./PlayersPage").then((m) => ({ default: m.PlayerPage })));
const LeadersPage = lazy(() => import("./LeadersPage"));
const TiePage = lazy(() => import("./TiePage"));
const MatchPage = lazy(() => import("./MatchPage"));

const NAV = [
  { to: "", label: "Live", icon: Home, end: true },
  { to: "schedule", label: "Schedule", icon: CalendarDays },
  { to: "standings", label: "Standings", icon: ListOrdered },
  { to: "brackets", label: "Brackets", icon: GitBranch },
  { to: "teams", label: "Teams", icon: Users },
  { to: "players", label: "Players", icon: UserRound },
  { to: "leaders", label: "Leaders", icon: Medal },
];
const MOBILE_NAV = NAV.filter((n) => ["Live", "Schedule", "Standings", "Brackets", "Teams"].includes(n.label));

export function PageSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-36 rounded-2xl" />
    </div>
  );
}

/** Page title block shared by the listing pages. */
export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-7">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-tight sm:text-5xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

function liveCount(b?: TournamentBundle) {
  return b ? b.ties.reduce((n, t) => n + t.matches.filter((m) => m.status === "LIVE").length, 0) : 0;
}

function Crest({ b }: { b?: TournamentBundle }) {
  const t = b?.tournament;
  if (t?.logoUrl) return <img src={t.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-border" />;
  const initials = (t?.name ?? "··").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-lime/25 to-lime/5 font-display text-lg font-bold text-lime-accent ring-1 ring-lime/30" aria-hidden>
      {initials}
    </span>
  );
}

export default function PublicRoutes() {
  const { slug = "" } = useParams();
  const q = useBundle(slug);
  const lk = useLookups(q.data);
  const { dark, toggle } = useTheme();
  const online = useSocketStatus();
  const reduce = useReducedMotion();
  const loc = useLocation();
  const base = `/t/${slug}`;
  const live = liveCount(q.data);

  useEffect(() => {
    if (q.data) document.title = `${q.data.tournament.name} · PickleLive`;
  }, [q.data]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [loc.pathname]);

  if (q.isError)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm">
          <LogoMark className="mx-auto mb-4 h-12 w-12" />
          <h1 className="font-display text-3xl font-bold uppercase">Tournament not found</h1>
          <p className="mt-2 text-muted-foreground">Check the link and try again.</p>
          <Button asChild variant="outline" className="mt-5"><Link to="/">All tournaments</Link></Button>
        </div>
      </div>
    );

  const t = q.data?.tournament;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 500, damping: 40 };
  return (
    <div className="relative min-h-dvh pb-24 md:pb-10">
      {/* ambient wash behind the header */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(198,255,0,0.07),transparent)]" />
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center gap-3">
          <Link to="/" aria-label="PickleLive home" className="hidden shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:block">
            <LogoMark className="h-8 w-8" />
          </Link>
          <span className="hidden h-7 w-px bg-border sm:block" aria-hidden />
          <Link to={base} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Crest b={q.data} />
            <span className="min-w-0">
              <span className="block truncate font-display text-lg font-bold uppercase leading-tight tracking-wide sm:text-xl">{t?.name ?? <Skeleton className="h-5 w-40" />}</span>
              {t && (
                <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  {t.venue && <><MapPin className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{t.venue}</span></>}
                  {t.startDate && <span className="hidden shrink-0 sm:inline">· {fmtDate(t.startDate)}</span>}
                </span>
              )}
            </span>
          </Link>
          {!online && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500" role="status">
              <WifiOff className="h-3.5 w-3.5" aria-hidden /><span className="hidden sm:inline">Reconnecting</span>
            </span>
          )}
          {live > 0 && (
            <Link to={base} className="flex h-9 items-center gap-2 rounded-full bg-live/15 px-3 text-xs font-bold uppercase tracking-[0.12em] text-live ring-1 ring-live/30 transition-colors hover:bg-live/25" aria-label={`${live} matches live now`}>
              <span className="relative flex h-2 w-2" aria-hidden><span className="absolute inset-0 rounded-full bg-live opacity-70 motion-safe:animate-ping" /><span className="relative h-2 w-2 rounded-full bg-live" /></span>
              <span className="tnum">{live}</span><span className="hidden sm:inline">Live</span>
            </Link>
          )}
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex"><a href={`${base}/tv`}><Tv /> TV mode</a></Button>
          {t && <ShareButton path={base} title={t.name} variant="ghost" />}
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>{dark ? <Sun /> : <Moon />}</Button>
        </div>
        <nav className="container hidden md:block" aria-label="Tournament sections">
          <ul className="-mb-px flex gap-1">
            {NAV.map((n) => (
              <li key={n.label}>
                <NavLink to={n.to ? `${base}/${n.to}` : base} end={n.end}
                  className={({ isActive }) => cn("relative flex h-12 items-center gap-2 px-3.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {({ isActive }) => (
                    <>
                      <n.icon className={cn("h-4 w-4", isActive && "text-lime-accent")} aria-hidden /> {n.label}
                      {isActive && <motion.span layoutId="tab-indicator" transition={spring} className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-lime shadow-glow" />}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="container py-5 sm:py-8">
        {!q.data ? (
          <PageSkeleton />
        ) : (
          <TournamentContext.Provider value={{ b: q.data, lk, slug, base }}>
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route index element={<LiveHome />} />
                <Route path="schedule" element={<SchedulePage />} />
                <Route path="standings" element={<StandingsPage />} />
                <Route path="brackets" element={<BracketsPage />} />
                <Route path="teams" element={<TeamsPage />} />
                <Route path="teams/:teamId" element={<TeamPage />} />
                <Route path="players" element={<PlayersPage />} />
                <Route path="players/:playerId" element={<PlayerPage />} />
                <Route path="leaders" element={<LeadersPage />} />
                <Route path="tie/:tieId" element={<TiePage />} />
                <Route path="match/:matchId" element={<MatchPage />} />
              </Routes>
            </Suspense>
          </TournamentContext.Provider>
        )}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Tournament sections">
        <ul className="grid grid-cols-5 px-1.5 py-1.5">
          {MOBILE_NAV.map((n) => (
            <li key={n.label}>
              <NavLink to={n.to ? `${base}/${n.to}` : base} end={n.end}
                className={({ isActive }) => cn("relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isActive ? "text-foreground" : "text-muted-foreground")}>
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="bottom-pill" transition={spring} className="absolute inset-0 -z-10 rounded-xl bg-lime/10ring-1 ring-lime/25" />}
                    <n.icon className={cn("h-5 w-5", isActive && "text-lime-accent")} aria-hidden />
                    {n.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
