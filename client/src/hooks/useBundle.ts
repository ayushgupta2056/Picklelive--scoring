import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getSocket, useRooms } from "@/lib/socket";
import { SOCKET, type MatchSummary, type TieSummary, type TournamentBundle } from "@shared/api";

/** Public tournament data, kept live by socket pushes (patched in place) and refetched on structural changes. */
export function useBundle(slug: string | undefined, opts: { admin?: boolean; tournamentId?: string } = {}) {
  const qc = useQueryClient();
  const key = useMemo(() => (opts.admin ? ["admin-bundle", opts.tournamentId] : ["bundle", slug]), [opts.admin, opts.tournamentId, slug]);
  const q = useQuery({
    queryKey: key,
    queryFn: () => (opts.admin ? api.get<TournamentBundle>(`/api/admin/tournaments/${opts.tournamentId}/bundle`) : api.get<TournamentBundle>(`/api/public/t/${slug}`)),
    enabled: opts.admin ? !!opts.tournamentId : !!slug,
    staleTime: 30_000,
  });
  const tid = q.data?.tournament.id;
  useRooms([tid ? `t:${tid}` : null]);

  useEffect(() => {
    if (!tid) return;
    const s = getSocket();
    // Socket payloads are public; the admin view keeps blind lineups it already knows.
    const merge = (prev: MatchSummary | undefined, next: MatchSummary): MatchSummary =>
      opts.admin && prev ? { ...next, lineupA: next.lineupA ?? prev.lineupA, lineupB: next.lineupB ?? prev.lineupB } : next;
    const onMatch = (m: MatchSummary) =>
      qc.setQueryData<TournamentBundle>(key, (b) =>
        b ? { ...b, ties: b.ties.map((t) => (t.id !== m.tieId ? t : { ...t, matches: t.matches.map((x) => (x.id === m.id ? merge(x, m) : x)) })) } : b,
      );
    const onTie = (t: TieSummary) =>
      qc.setQueryData<TournamentBundle>(key, (b) =>
        b ? { ...b, ties: b.ties.map((x) => (x.id !== t.id ? x : { ...t, matches: t.matches.map((nm) => merge(x.matches.find((om) => om.id === nm.id), nm)) })) } : b,
      );
    const onInvalidate = () => qc.invalidateQueries({ queryKey: key });
    s.on(SOCKET.matchUpdate, onMatch);
    s.on(SOCKET.tieUpdate, onTie);
    s.on(SOCKET.invalidate, onInvalidate);
    return () => {
      s.off(SOCKET.matchUpdate, onMatch);
      s.off(SOCKET.tieUpdate, onTie);
      s.off(SOCKET.invalidate, onInvalidate);
    };
  }, [tid, qc, key, opts.admin]);

  return q;
}

/** Lookup helpers over a bundle. */
export function useLookups(b: TournamentBundle | undefined) {
  return useMemo(() => {
    const teams = new Map(b?.teams.map((t) => [t.id, t]) ?? []);
    const players = new Map(b?.players.map((p) => [p.id, p]) ?? []);
    const categories = new Map(b?.categories.map((c) => [c.id, c]) ?? []);
    const ties = new Map(b?.ties.map((t) => [t.id, t]) ?? []);
    const matches = new Map(b?.ties.flatMap((t) => t.matches.map((m) => [m.id, m] as const)) ?? []);
    return { teams, players, categories, ties, matches };
  }, [b]);
}
