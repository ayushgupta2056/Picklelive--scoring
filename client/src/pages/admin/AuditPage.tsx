import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useA } from "./data";
import { PageHeader } from "./ui";

interface Row { id: string; actor: string; action: string; entity: string; entityId: string | null; details: unknown; createdAt: string }

export default function AuditPage() {
  const { tid, b } = useA();
  const q = useQuery({ queryKey: ["audit", tid], queryFn: () => api.get<Row[]>(`/api/admin/tournaments/${tid}/audit?limit=500`), refetchInterval: 15000 });
  return (
    <div>
      <PageHeader title="Audit log" description="Who changed what, and when: lineups, overrides, results, ref links, schedule." />
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">When</th><th className="p-2">Who</th><th className="p-2">Action</th><th className="p-2">Details</th></tr></thead>
          <tbody>
            {q.data?.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="whitespace-nowrap p-2 tnum">{new Date(r.createdAt).toLocaleString("en-IN", { timeZone: b.tournament.timezone })}</td>
                <td className="p-2">{r.actor.replace(/^ref:.*/, "referee")}</td>
                <td className="p-2 font-semibold">{r.action}</td>
                <td className="max-w-xl truncate p-2 font-mono text-xs text-muted-foreground" title={JSON.stringify(r.details)}>{JSON.stringify(r.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
