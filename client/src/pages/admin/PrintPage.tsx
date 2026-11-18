import { useEffect } from "react";
import { lineupNames } from "@/components/public/MatchBits";
import { dayKey, fmtDay, fmtTime } from "@/lib/format";
import { useA } from "./data";

/** Printable schedule: one page per day, ordered by time and court. */
export default function PrintPage() {
  const { b, lk } = useA();
  const tz = b.tournament.timezone;
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  const rows = b.ties.flatMap((t) => t.matches.map((m) => ({ t, m }))).filter((x) => x.m.status !== "NOT_REQUIRED").sort((x, y) => (x.m.scheduledAt ?? "9").localeCompare(y.m.scheduledAt ?? "9") || (x.m.court ?? "").localeCompare(y.m.court ?? ""));
  const days = [...new Set(rows.map((r) => dayKey(r.m.scheduledAt, tz)))];
  return (
    <div className="bg-white p-6 text-black">
      {days.map((d) => (
        <section key={d} className="print-break mb-8">
          <h1 className="text-xl font-black">{b.tournament.name} · {d === "unscheduled" ? "Unscheduled" : fmtDay(rows.find((r) => dayKey(r.m.scheduledAt, tz) === d)!.m.scheduledAt, tz)}</h1>
          <p className="mb-3 text-xs">{b.tournament.venue} · times in {tz}</p>
          <table className="w-full border-collapse text-xs">
            <thead><tr className="border-b-2 border-black text-left"><th className="py-1">Time</th><th>Court</th><th>Cat.</th><th>Tie</th><th>Lineup A</th><th>Lineup B</th><th>Score</th></tr></thead>
            <tbody>
              {rows.filter((r) => dayKey(r.m.scheduledAt, tz) === d).map(({ t, m }) => (
                <tr key={m.id} className="border-b border-gray-300">
                  <td className="py-1 font-bold">{fmtTime(m.scheduledAt, tz)}</td>
                  <td>{m.court}</td>
                  <td>{lk.categories.get(m.categoryId)?.code}</td>
                  <td>{lk.teams.get(t.teamAId ?? "")?.code ?? "TBD"} v {lk.teams.get(t.teamBId ?? "")?.code ?? "TBD"}</td>
                  <td>{m.lineupA ? lineupNames(m.lineupA, lk.players) : ""}</td>
                  <td>{m.lineupB ? lineupNames(m.lineupB, lk.players) : ""}</td>
                  <td className="w-28">{m.games.map((g) => `${g.a}-${g.b}`).join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
