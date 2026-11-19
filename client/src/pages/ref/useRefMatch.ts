import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { api, ApiError, errorMessage } from "@/lib/api";
import { uid } from "@/lib/utils";
import { replay, tryAppend } from "@shared/scoring/engine";
import { EngineError, type EngineEvent, type MatchState } from "@shared/scoring/types";
import { SOCKET, type RefBundle } from "@shared/api";

export interface QueuedEvent {
  seq: number;
  idempotencyKey: string;
  event: EngineEvent;
}

const qKey = (matchId: string) => `pl-queue-${matchId}`;

/**
 * Referee data + offline-tolerant event pipeline:
 * - events are validated locally with the same engine, applied optimistically, and queued in IndexedDB;
 * - the queue is flushed in order; the server dedupes by idempotency key and rejects out-of-order seq;
 * - on reconnect the full state is re-fetched.
 */
export function useRefMatch(matchId: string, token: string) {
  // No token = signed in with the shared referee login (httpOnly cookie) instead of a per-match link.
  const sessionMode = !token;
  const headers = useMemo((): Record<string, string> => (token ? { "x-ref-token": token } : {}), [token]);
  const [bundle, setBundle] = useState<RefBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedEvent[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [netOk, setNetOk] = useState(true);
  const [revoked, setRevoked] = useState(false);
  const flushing = useRef(false);
  const queueRef = useRef<QueuedEvent[]>([]);
  const bundleRef = useRef<RefBundle | null>(null);
  bundleRef.current = bundle;

  const persist = useCallback(
    (q: QueuedEvent[]) => {
      queueRef.current = q;
      setQueue(q);
      idbSet(qKey(matchId), q).catch(() => undefined);
    },
    [matchId],
  );

  const load = useCallback(async () => {
    try {
      const b = await api.get<RefBundle>(`/api/ref/${matchId}`, headers);
      bundleRef.current = b; // so a send() right after load() uses the fresh seq
      setBundle(b);
      setLoadError(null);
      setNetOk(true);
      // Drop queued events the server already has (same idempotency keys can't be detected here, but seq can).
      const q = queueRef.current.filter((e) => e.seq > b.match.seq);
      if (q.length !== queueRef.current.length) persist(q);
      return b;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setRevoked(true);
      else if (e instanceof ApiError && e.status === 0) setNetOk(false);
      else setLoadError(errorMessage(e));
      return null;
    }
  }, [matchId, headers, persist]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (queueRef.current.length) {
        const next = queueRef.current[0];
        try {
          const r = await api.post<{ duplicate: boolean; seq: number; state: MatchState }>(`/api/ref/${matchId}/events`, next, headers);
          setNetOk(true);
          setBundle((b) => (b ? { ...b, events: [...b.events, next.event], state: r.state, match: { ...b.match, seq: r.seq } } : b));
          persist(queueRef.current.slice(1));
        } catch (e) {
          if (e instanceof ApiError && e.status === 0) {
            setNetOk(false);
            break; // stay queued; retried on reconnect / timer
          }
          if (e instanceof ApiError && e.status === 401) {
            setRevoked(true);
            break;
          }
          const dropped = queueRef.current.length;
          persist([]);
          if (e instanceof ApiError && e.status === 409) {
            toast.error(dropped > 1 ? `${dropped} queued actions discarded: the match changed on another device` : errorMessage(e));
          } else toast.error(`Action rejected: ${errorMessage(e)}`);
          await load();
          break;
        }
      }
    } finally {
      flushing.current = false;
    }
  }, [matchId, headers, persist, load]);

  // initial load: queue from IndexedDB first, then server
  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = ((await idbGet(qKey(matchId)).catch(() => undefined)) as QueuedEvent[] | undefined) ?? [];
      if (!alive) return;
      queueRef.current = saved;
      setQueue(saved);
      setQueueLoaded(true);
      await load();
      if (saved.length) flush();
    })();
    return () => {
      alive = false;
    };
  }, [matchId, load, flush]);

  // referee socket: authenticated with the match-scoped token
  useEffect(() => {
    const s: Socket = io({ auth: token ? { refToken: token, matchId } : { matchId, session: true }, transports: ["websocket", "polling"], reconnectionDelayMax: 4000, withCredentials: true });
    s.on("connect", () => setNetOk(true));
    s.on("disconnect", () => setNetOk(false));
    s.io.on("reconnect", async () => {
      await flush();
      if (!queueRef.current.length) load();
    });
    s.on(SOCKET.refRevoked, () => setRevoked(true));
    s.on(SOCKET.matchState, (d: { matchId: string; seq: number }) => {
      const b = bundleRef.current;
      if (d.matchId === matchId && b && d.seq > b.match.seq + queueRef.current.length && !flushing.current) load();
    });
    s.on(SOCKET.matchUpdate, (m: { id: string; seq: number; lineupALocked: boolean; lineupBLocked: boolean; lineupA: string[] | null; lineupB: string[] | null }) => {
      const b = bundleRef.current;
      if (m.id === matchId && b && m.seq === b.match.seq && !queueRef.current.length) load(); // lineup / admin changes
    });
    return () => {
      s.disconnect();
    };
  }, [matchId, token, flush, load]);

  // retry timer while offline with queued events
  useEffect(() => {
    if (!queue.length) return;
    const t = setInterval(() => flush(), 4000);
    const onOnline = () => flush();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", onOnline);
    };
  }, [queue.length, flush]);

  const events = useMemo(() => (bundle ? [...bundle.events, ...queue.map((q) => q.event)] : []), [bundle, queue]);
  const state = useMemo(() => (bundle ? replay(bundle.config, events) : null), [bundle, events]);

  /** Validate locally, apply optimistically, queue and flush. Returns false if the engine rejects it. */
  const send = useCallback(
    (event: EngineEvent): boolean => {
      const b = bundleRef.current;
      if (!b) return false;
      try {
        tryAppend(b.config, [...b.events, ...queueRef.current.map((q) => q.event)], event);
      } catch (e) {
        toast.error(e instanceof EngineError ? e.message : errorMessage(e));
        return false;
      }
      const seq = b.match.seq + queueRef.current.length + 1;
      persist([...queueRef.current, { seq, idempotencyKey: uid(), event: { ...event, at: new Date().toISOString() } }]);
      flush();
      return true;
    },
    [persist, flush],
  );

  return { bundle, state, events, queue, queueLoaded, netOk, revoked, loadError, load, send, headers, sessionMode };
}
