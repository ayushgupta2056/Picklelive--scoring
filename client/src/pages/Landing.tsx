import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarDays, MapPin, Radio, Shield, Smartphone, Trophy, Tv } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/match/bits";
import { Logo } from "@/components/Logo";

interface T { id: string; slug: string; name: string; venue: string | null; startDate: string | null; logoUrl: string | null }

const FEATURES = [
  { icon: Radio, title: "Every point, live", body: "Ties, matches and standings update the instant the referee taps. No refresh." },
  { icon: Smartphone, title: "One-tap refereeing", body: "Phone-first scoring with the correct server, side and call, even offline." },
  { icon: Tv, title: "Big-screen mode", body: "Broadcast-style scoreboards for the venue TV, readable from across the hall." },
];

/** Decorative court lines behind the hero. */
function CourtLines() {
  return (
    <svg aria-hidden viewBox="0 0 600 300" className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-[420px] w-[min(1100px,140%)] max-w-none opacity-[0.07] [mask-image:radial-gradient(closest-side,black,transparent)]">
      <g fill="none" stroke="#C6FF00" strokeWidth="2">
        <rect x="20" y="20" width="560" height="260" rx="4" />
        <line x1="300" y1="20" x2="300" y2="280" strokeWidth="4" />
        <line x1="230" y1="20" x2="230" y2="280" />
        <line x1="370" y1="20" x2="370" y2="280" />
        <line x1="20" y1="150" x2="230" y2="150" />
        <line x1="370" y1="150" x2="580" y2="150" />
      </g>
    </svg>
  );
}

export default function Landing() {
  const q = useQuery({ queryKey: ["tournaments"], queryFn: () => api.get<T[]>("/api/public/tournaments") });
  const reduce = useReducedMotion();
  const fade = (i: number) => (reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: 0.06 * i, ease: [0.16, 1, 0.3, 1] } });
  const first = q.data?.[0];
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(50%_60%_at_50%_0%,rgba(198,255,0,0.12),transparent)]" />
      <div className="container max-w-5xl">
        <header className="flex h-16 items-center justify-between">
          <Logo />
          <Button asChild variant="ghost" size="sm"><Link to="/admin"><Shield /> Admin</Link></Button>
        </header>

        <section className="relative pb-12 pt-14 text-center sm:pb-16 sm:pt-24">
          <CourtLines />
          <motion.p {...fade(0)} className="relative mx-auto inline-flex items-center gap-2 rounded-full border border-lime/30 bg-lime/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-lime-accent">
            <span className="relative flex h-2 w-2" aria-hidden><span className="absolute inset-0 rounded-full bg-lime opacity-70 motion-safe:animate-ping" /><span className="relative h-2 w-2 rounded-full bg-lime" /></span>
            Team pickleball · live
          </motion.p>
          <motion.h1 {...fade(1)} className="relative mt-5 font-display text-[clamp(3rem,11vw,7.5rem)] font-extrabold uppercase leading-[0.85] tracking-tight">
            Every rally.<br /><span className="text-lime-accent text-glow">Every point.</span>
          </motion.h1>
          <motion.p {...fade(2)} className="relative mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Follow ties, live scores, standings and brackets in real time, from the first serve to the final.
          </motion.p>
          <motion.div {...fade(3)} className="relative mt-8 flex flex-wrap justify-center gap-3">
            {first ? (
              <Button asChild size="lg" className="shadow-glow"><Link to={`/t/${first.slug}`}>Follow {first.name} <ArrowRight /></Link></Button>
            ) : (
              <Button asChild size="lg" className="shadow-glow"><Link to="/admin">Create a tournament <ArrowRight /></Link></Button>
            )}
            {first && <Button asChild size="lg" variant="outline"><a href={`/t/${first.slug}/tv`}><Tv /> TV mode</a></Button>}
          </motion.div>
        </section>

        <section aria-labelledby="t-h" className="pb-12">
          <h2 id="t-h" className="eyebrow mb-3">Tournaments</h2>
          <div className="grid gap-3">
            {q.isLoading && [0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
            {q.data?.length === 0 && <EmptyState icon={<Trophy className="h-7 w-7" />} title="No tournaments yet">An admin can create one from the admin panel.</EmptyState>}
            {q.data?.map((t, i) => (
              <motion.div key={t.id} {...fade(4 + i)}>
                <Link to={`/t/${t.slug}`} className="surface hover-lift group flex items-center gap-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
                  {t.logoUrl ? <img src={t.logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-lime text-black"><Trophy aria-hidden /></span>}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-2xl font-bold uppercase leading-tight tracking-wide">{t.name}</h3>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                      {t.startDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{fmtDate(t.startDate.slice(0, 10))}</span>}
                      {t.venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{t.venue}</span>}
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-lime-accent" aria-hidden />
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        <section aria-label="Features" className="grid gap-3 pb-16 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="surface p-5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-lime/10 text-lime-accent ring-1 ring-lime/25"><f.icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-4 font-display text-xl font-bold uppercase tracking-wide">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
