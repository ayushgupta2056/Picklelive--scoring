import { lazy, Suspense } from "react";
import { NavLink, Route, Routes, useParams } from "react-router-dom";
import { CalendarDays, GitBranch, Home, ListOrdered, Medal, Moon, Sun, Tv, Users, UserRound, WifiOff } from "lucide-react";
import { useBundle, useLookups } from "@/hooks/useBundle";
import { useTheme } from "@/hooks/useTheme";
import { useSocketStatus } from "@/lib/socket";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareButton } from "@/components/public/Share";
import { TournamentContext } from "@/components/public/context";
import { useEffect } from "react";

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
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  );
}

export default function PublicRoutes() {
  const { slug = "" } = useParams();
  const q = useBundle(slug);
  const lk = useLookups(q.data);
  const { dark, toggle } = useTheme();
  const online = useSocketStatus();
  const base = `/t/${slug}`;

  useEffect(() => {
    if (q.data) document.title = `${q.data.tournament.name} · PickleLive`;
  }, [q.data]);

  if (q.isError)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-black">Tournament not found</h1>
          <p className="text-muted-foreground">Check the link and try again.</p>
        </div>
      </div>
    );

  const t = q.data?.tournament;
  return (
    <div className="min-h-dvh pb-20 md:pb-8">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="container flex h-14 items-center gap-3">
          <Logo className="shrink-0 [&_span]:hidden sm:[&_span]:inline" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold sm:text-base">{t?.name ?? <Skeleton className="h-4 w-40" />}</div>
            {t && <div className="truncate text-xs text-muted-foreground">{[t.venue, t.startDate && fmtDate(t.startDate)].filter(Boolean).join(" · ")}</div>}
          </div>
          {!online && <span className="flex items-center gap-1 text-xs font-semibold text-amber-500" role="status"><WifiOff className="h-4 w-4" /><span className="hidden sm:inline">Reconnecting…</span></span>}
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><a href={`${base}/tv`}><Tv /> TV</a></Button>
          {t && <ShareButton path={base} title={t.name} variant="ghost" />}
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>{dark ? <Sun /> : <Moon />}</Button>
        </div>
        <nav className="container hidden gap-1 overflow-x-auto md:flex" aria-label="Tournament">
          {NAV.map((n) => (
            <NavLink key={n.label} to={n.to ? `${base}/${n.to}` : base} end={n.end}
              className={({ isActive }) => cn("flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold", isActive ? "border-lime text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="container py-4 sm:py-6">
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
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Tournament">
        {MOBILE_NAV.map((n) => (
          <NavLink key={n.label} to={n.to ? `${base}/${n.to}` : base} end={n.end}
            className={({ isActive }) => cn("flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", isActive ? "text-lime-accent" : "text-muted-foreground")}>
            <n.icon className="h-5 w-5" /> {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
