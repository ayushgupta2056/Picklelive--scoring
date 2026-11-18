import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Shield, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/match/bits";
import { Logo } from "@/components/Logo";

interface T { id: string; slug: string; name: string; venue: string | null; startDate: string | null; logoUrl: string | null }

export default function Landing() {
  const q = useQuery({ queryKey: ["tournaments"], queryFn: () => api.get<T[]>("/api/public/tournaments") });
  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <Link to="/admin" className="inline-flex h-12 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"><Shield className="h-4 w-4" /> Admin</Link>
      </header>
      <section className="mt-10">
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Live team pickleball, <span className="text-lime-accent">point by point.</span></h1>
        <p className="mt-3 max-w-xl text-muted-foreground">Follow ties, live scores, standings and brackets in real time. No refresh needed.</p>
      </section>
      <section className="mt-8 grid gap-3">
        {q.isLoading && [0, 1].map((i) => <Skeleton key={i} className="h-24" />)}
        {q.data?.length === 0 && <EmptyState icon={<Trophy className="h-8 w-8" />} title="No tournaments yet">An admin can create one from the admin panel.</EmptyState>}
        {q.data?.map((t) => (
          <Link key={t.id} to={`/t/${t.slug}`}>
            <Card className="flex items-center gap-4 p-4 transition-colors hover:border-lime">
              {t.logoUrl ? <img src={t.logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-xl bg-lime text-black"><Trophy /></div>}
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold">{t.name}</h2>
                <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                  {t.startDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(t.startDate.slice(0, 10))}</span>}
                  {t.venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{t.venue}</span>}
                </p>
              </div>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
