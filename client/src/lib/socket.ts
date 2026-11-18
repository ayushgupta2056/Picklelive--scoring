import { io, type Socket } from "socket.io-client";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

let publicSocket: Socket | null = null;
const roomRefs = new Map<string, number>();

export function getSocket(): Socket {
  if (!publicSocket) {
    publicSocket = io({ transports: ["websocket", "polling"], reconnectionDelayMax: 5000 });
    // Re-join every active room after a reconnect.
    publicSocket.on("connect", () => {
      const rooms = [...roomRefs.keys()];
      if (rooms.length) publicSocket!.emit("join", rooms);
    });
  }
  return publicSocket;
}

/** Join rooms while mounted. On every (re)connect, all queries are re-fetched so nobody sees a stale score. */
export function useRooms(rooms: (string | null | undefined)[]) {
  const qc = useQueryClient();
  const key = rooms.filter(Boolean).join("|");
  useEffect(() => {
    const list = key ? key.split("|") : [];
    const s = getSocket();
    for (const r of list) roomRefs.set(r, (roomRefs.get(r) ?? 0) + 1);
    if (s.connected && list.length) s.emit("join", list);
    // After a reconnect, re-fetch everything: the server's state is the source of truth.
    const onReconnect = () => qc.invalidateQueries();
    s.io.on("reconnect", onReconnect);
    return () => {
      s.io.off("reconnect", onReconnect);
      const leave: string[] = [];
      for (const r of list) {
        const n = (roomRefs.get(r) ?? 1) - 1;
        if (n <= 0) {
          roomRefs.delete(r);
          leave.push(r);
        } else roomRefs.set(r, n);
      }
      if (leave.length) s.emit("leave", leave);
    };
  }, [key, qc]);
}

export function useSocketStatus() {
  const [connected, setConnected] = useState(() => getSocket().connected);
  useEffect(() => {
    const s = getSocket();
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on("connect", on);
    s.on("disconnect", off);
    setConnected(s.connected);
    return () => {
      s.off("connect", on);
      s.off("disconnect", off);
    };
  }, []);
  return connected;
}
