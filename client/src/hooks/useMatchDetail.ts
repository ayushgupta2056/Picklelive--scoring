import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getSocket, useRooms } from "@/lib/socket";
import { SOCKET, type MatchDetail, type MatchSummary } from "@shared/api";
import type { MatchState } from "@shared/scoring/types";

/** Full live state for one match (timeline, positions, stats), pushed over the match room. */
export function useMatchDetail(matchId: string | undefined) {
  const qc = useQueryClient();
  const key = ["match", matchId];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<MatchDetail>(`/api/public/matches/${matchId}`), enabled: !!matchId });
  useRooms([matchId ? `match:${matchId}` : null]);
  useEffect(() => {
    if (!matchId) return;
    const s = getSocket();
    const onState = (d: { matchId: string; state: MatchState }) => d.matchId === matchId && qc.setQueryData<MatchDetail>(["match", matchId], (o) => (o ? { ...o, state: d.state } : o));
    const onMatch = (m: MatchSummary) => {
      if (m.id !== matchId) return;
      qc.setQueryData<MatchDetail>(["match", matchId], (o) => (o ? { ...o, match: m } : o));
      // status changes without a state push (lineups, reset): refetch full detail
      const cur = qc.getQueryData<MatchDetail>(["match", matchId]);
      if (cur && cur.state.effectiveEvents === 0 && m.seq > 0) qc.invalidateQueries({ queryKey: ["match", matchId] });
      if (m.seq === 0 && cur && cur.state.phase !== "NOT_STARTED") qc.invalidateQueries({ queryKey: ["match", matchId] });
    };
    s.on(SOCKET.matchState, onState);
    s.on(SOCKET.matchUpdate, onMatch);
    return () => {
      s.off(SOCKET.matchState, onState);
      s.off(SOCKET.matchUpdate, onMatch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, qc]);
  return q;
}
