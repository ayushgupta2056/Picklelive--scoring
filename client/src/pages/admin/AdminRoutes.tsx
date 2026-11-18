import { lazy, Suspense, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarRange, ChevronLeft, ExternalLink, FileClock, Gauge, LayoutGrid, ListChecks, LogOut, Menu, Monitor, Moon, Settings, Shapes, Sun, Swords, Trophy, Users, UserRound, Plus,
} from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/match/bits";
import { PageSkeleton } from "../public/PublicRoutes";
import { AdminContext, useAdminData } from "./data";

const Dashboard = lazy(() => import("./Dashboard"));
const CategoriesPage = lazy(() => import("./CategoriesPage"));
const FormatsPage = lazy(() => import("./FormatsPage"));
const TeamsAdmin = lazy(() => import("./TeamsAdmin"));
const PlayersAdmin = lazy(() => import("./PlayersAdmin"));
const StagesPage = lazy(() => import("./StagesPage"));
const TiesPage = lazy(() => import("./TiesPage"));
const TieAdmin = lazy(() => import("./TieAdmin"));
const SchedulePage = lazy(() => import("./ScheduleBoard"));
const DisplayPage = lazy(() => import("./DisplayPage"));
const SettingsPage = lazy(() => import("./SettingsPage"));
const AuditPage = lazy(() => import("./AuditPage"));
const PrintPage = lazy(() => import("./PrintPage"));

export default function AdminRoutes() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<{ admin: boolean; email?: string }>("/api/auth/me") });
  if (me.isLoading) return <PageSkeleton />;
  if (!me.data?.admin) return <Login />;
  return (
    <Routes>
      <Route index element={<TournamentList />} />
      <Route path="t/:tid/print" element={<TournamentShell bare><Suspense fallback={<PageSkeleton />}><PrintPage /></Suspense></TournamentShell>} />
      <Route path="t/:tid/*" element={<TournamentShell />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

function Login() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Logo />
          <CardTitle className="pt-4 text-xl">Admin sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.post("/api/auth/login", { email, password });
              await qc.invalidateQueries({ queryKey: ["me"] });
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}>
            <Field label="Email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <Button type="submit" disabled={busy}>Sign in</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function logout(qc: ReturnType<typeof useQueryClient>) {
  return api.post("/api/auth/logout").then(() => qc.invalidateQueries({ queryKey: ["me"] }));
}

interface TRow { id: string; name: string; slug: string; venue: string | null; startDate: string | null; teams: number; ties: number }

function TournamentList() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["admin-tournaments"], queryFn: () => api.get<TRow[]>("/api/admin/tournaments") });
  const [open, setOpen] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ name: "", slug: "", venue: "", startDate: today, endDate: today, ageCutoffDate: `${today.slice(0, 4)}-01-01`, timezone: "Asia/Kolkata", withPresets: true });
  return (
    <div className="container max-w-4xl py-6">
      <header className="mb-6 flex items-center justify-between">
        <Logo to="/admin" />
        <Button variant="ghost" onClick={() => logout(qc)}><LogOut /> Sign out</Button>
      </header>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-black">Tournaments</h1>
        <Button onClick={() => setOpen(true)}><Plus /> New tournament</Button>
      </div>
      {q.isLoading && <Skeleton className="h-24" />}
      {q.data?.length === 0 && <EmptyState icon={<Trophy className="h-8 w-8" />} title="No tournaments yet">Create your first one; category presets (MD, WD, XD, U18…) are added for you.</EmptyState>}
      <div className="grid gap-3">
        {q.data?.map((t) => (
          <Link key={t.id} to={`/admin/t/${t.id}`}>
            <Card className="flex items-center justify-between gap-4 p-4 hover:border-lime">
              <div>
                <div className="font-bold">{t.name}</div>
                <div className="text-sm text-muted-foreground">/t/{t.slug} · {t.teams} teams · {t.ties} ties</div>
              </div>
              <ChevronLeft className="h-5 w-5 rotate-180 text-muted-foreground" />
            </Card>
          </Link>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New tournament">
          <form className="grid gap-3" onSubmit={async (e) => {
            e.preventDefault();
            try {
              const t = await api.post<{ id: string }>("/api/admin/tournaments", { ...f, venue: f.venue || null });
              await qc.invalidateQueries({ queryKey: ["admin-tournaments"] });
              nav(`/admin/t/${t.id}`);
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}>
            <Field label="Name"><Input value={f.name} required onChange={(e) => setF({ ...f, name: e.target.value, slug: slugTouched ? f.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} /></Field>
            <Field label="URL slug" hint="Public page: /t/your-slug"><Input value={f.slug} required pattern="[a-z0-9][a-z0-9-]+" onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: e.target.value.toLowerCase() }); }} /></Field>
            <Field label="Venue"><Input value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
              <Field label="End date"><Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
            </div>
            <Field label="Age cutoff date" hint="Ages for U18 / 35+ etc. are computed on this date"><Input type="date" value={f.ageCutoffDate} required onChange={(e) => setF({ ...f, ageCutoffDate: e.target.value })} /></Field>
            <Field label="Timezone"><Input value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></Field>
            <Switch label="Add category presets (MD, WD, XD, U18, U14, 35+, 50+, Open Singles)" checked={f.withPresets} onCheckedChange={(v) => setF({ ...f, withPresets: v })} />
            <Button type="submit">Create</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const NAV = [
  { to: "", label: "Dashboard", icon: Gauge, end: true },
  { to: "categories", label: "Categories", icon: Shapes },
  { to: "formats", label: "Tie formats", icon: ListChecks },
  { to: "teams", label: "Teams", icon: Users },
  { to: "players", label: "Players", icon: UserRound },
  { to: "stages", label: "Stages", icon: LayoutGrid },
  { to: "ties", label: "Ties & lineups", icon: Swords },
  { to: "schedule", label: "Schedule", icon: CalendarRange },
  { to: "display", label: "Big display", icon: Monitor },
  { to: "settings", label: "Settings", icon: Settings },
  { to: "audit", label: "Audit log", icon: FileClock },
];

function TournamentShell({ bare, children }: { bare?: boolean; children?: React.ReactNode }) {
  const { tid = "" } = useParams();
  const { t, b, lk, refresh } = useAdminData(tid);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("pl-sidebar") === "1");
  const [mobile, setMobile] = useState(false);
  const { dark, toggle } = useTheme();
  const qc = useQueryClient();
  if (t.isError) return <div className="p-8"><EmptyState title="Tournament not found"><Link className="underline" to="/admin">Back</Link></EmptyState></div>;
  if (!t.data || !b.data) return <div className="p-8"><PageSkeleton /></div>;
  const ctx = { t: t.data, b: b.data, lk, tid, refresh };
  if (bare) return <AdminContext.Provider value={ctx}>{children}</AdminContext.Provider>;

  const nav = (
    <nav className="grid gap-1 p-2" aria-label="Admin">
      {NAV.map((n) => (
        <NavLink key={n.label} to={`/admin/t/${tid}${n.to ? `/${n.to}` : ""}`} end={n.end} onClick={() => setMobile(false)} title={n.label}
          className={({ isActive }) => cn("flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold", isActive ? "bg-lime/15 text-lime-accent" : "text-muted-foreground hover:bg-accent hover:text-foreground", collapsed && "lg:justify-center lg:px-0")}>
          <n.icon className="h-5 w-5 shrink-0" /> <span className={cn(collapsed && "lg:sr-only")}>{n.label}</span>
        </NavLink>
      ))}
    </nav>
  );
  return (
    <AdminContext.Provider value={ctx}>
      <div className="flex min-h-dvh">
        <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-card lg:flex", collapsed ? "w-16" : "w-60")}>
          <div className={cn("flex h-14 items-center border-b px-3", collapsed && "justify-center")}>{collapsed ? <Trophy className="h-5 w-5 text-lime-accent" /> : <Logo to="/admin" />}</div>
          <div className="flex-1 overflow-y-auto">{nav}</div>
          <Button variant="ghost" className="m-2" onClick={() => {
            setCollapsed(!collapsed);
            localStorage.setItem("pl-sidebar", collapsed ? "0" : "1");
          }} aria-label="Collapse sidebar"><ChevronLeft className={cn("transition-transform", collapsed && "rotate-180")} /></Button>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-5">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobile(true)} aria-label="Menu"><Menu /></Button>
            <Link to="/admin" className="truncate font-bold hover:underline">{t.data.name}</Link>
            <div className="ml-auto flex items-center gap-1">
              <Button asChild variant="ghost" size="sm"><a href={`/t/${t.data.slug}`} target="_blank" rel="noreferrer"><ExternalLink /> <span className="hidden sm:inline">Public site</span></a></Button>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">{dark ? <Sun /> : <Moon />}</Button>
              <Button variant="ghost" size="icon" onClick={() => logout(qc)} aria-label="Sign out"><LogOut /></Button>
            </div>
          </header>
          <main className="p-3 sm:p-5 lg:p-6">
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route index element={<Dashboard />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="formats" element={<FormatsPage />} />
                <Route path="teams" element={<TeamsAdmin />} />
                <Route path="players" element={<PlayersAdmin />} />
                <Route path="stages" element={<StagesPage />} />
                <Route path="ties" element={<TiesPage />} />
                <Route path="ties/:tieId" element={<TieAdmin />} />
                <Route path="schedule" element={<SchedulePage />} />
                <Route path="display" element={<DisplayPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="audit" element={<AuditPage />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
      <Dialog open={mobile} onOpenChange={setMobile}>
        <DialogContent title="Menu" className="left-0 top-0 h-dvh max-h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none">{nav}</DialogContent>
      </Dialog>
    </AdminContext.Provider>
  );
}
