import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { prisma } from "./db";
import { env } from "./env";
import { tokenMatches } from "./tokens";
import { parseCookieHeader } from "./auth";
import { REF_COOKIE, refFromToken } from "./refSession";
import { SOCKET, type MatchSummary, type TieSummary } from "@shared/api";
import type { MatchState } from "@shared/scoring/types";

let io: Server | null = null;

const ROOM_RE = /^(t|tie|match):[A-Za-z0-9_-]{1,64}$/;

export function initRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: env.appOrigin ? { origin: env.appOrigin, credentials: true } : undefined,
    serveClient: false,
    pingInterval: 20000,
    pingTimeout: 25000,
  });

  io.on("connection", async (socket) => {
    // Referee sockets authenticate with their match-scoped token; everyone else is read-only.
    const { refToken, matchId, session } = (socket.handshake.auth ?? {}) as { refToken?: string; matchId?: string; session?: boolean };
    if (session && matchId && typeof matchId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(matchId)) {
      // Signed-in referee (shared login): authenticated by the httpOnly cookie sent with the handshake.
      const who = refFromToken(parseCookieHeader(socket.handshake.headers.cookie)[REF_COOKIE]);
      if (!who) {
        socket.emit(SOCKET.refRevoked, { matchId });
        socket.disconnect(true);
        return;
      }
      socket.join(`match:${matchId}`);
    } else if (refToken && matchId) {
      const m = await prisma.match.findUnique({ where: { id: String(matchId) }, select: { refTokenHash: true } });
      if (!m || !tokenMatches(String(refToken), m.refTokenHash)) {
        socket.emit(SOCKET.refRevoked, { matchId });
        socket.disconnect(true);
        return;
      }
      socket.join(`ref:${matchId}`);
      socket.join(`match:${matchId}`);
    }

    // Public, read-only subscriptions. Clients can only join whitelisted room shapes.
    socket.on("join", (rooms: unknown) => {
      if (!Array.isArray(rooms)) return;
      for (const r of rooms.slice(0, 20)) if (typeof r === "string" && ROOM_RE.test(r)) socket.join(r);
    });
    socket.on("leave", (rooms: unknown) => {
      if (!Array.isArray(rooms)) return;
      for (const r of rooms) if (typeof r === "string" && ROOM_RE.test(r)) socket.leave(r);
    });
    // Any other client-originated event is ignored: sockets never write.
  });
  return io;
}

export function emitMatch(tournamentId: string, summary: MatchSummary, state?: MatchState) {
  if (!io) return;
  io.to([`t:${tournamentId}`, `tie:${summary.tieId}`, `match:${summary.id}`]).emit(SOCKET.matchUpdate, summary);
  if (state) io.to(`match:${summary.id}`).emit(SOCKET.matchState, { matchId: summary.id, seq: summary.seq, state });
}

export function emitTie(tournamentId: string, tie: TieSummary) {
  io?.to([`t:${tournamentId}`, `tie:${tie.id}`]).emit(SOCKET.tieUpdate, tie);
}

export function emitInvalidate(tournamentId: string, reason: string) {
  io?.to(`t:${tournamentId}`).emit(SOCKET.invalidate, { reason });
}

/** Revoking a ref link instantly disconnects any referee device using it. */
export function kickRef(matchId: string) {
  if (!io) return;
  io.to(`ref:${matchId}`).emit(SOCKET.refRevoked, { matchId });
  io.in(`ref:${matchId}`).disconnectSockets(true);
}
