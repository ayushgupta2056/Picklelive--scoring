import { createContext, useCallback, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useBundle, useLookups } from "@/hooks/useBundle";
import type { TournamentBundle } from "@shared/api";
import type { ATournament } from "./types";

export function useAdminTournament(tid: string) {
  return useQuery({ queryKey: ["admin-t", tid], queryFn: () => api.get<ATournament>(`/api/admin/tournaments/${tid}`), enabled: !!tid });
}

export interface ACtx {
  t: ATournament;
  b: TournamentBundle;
  lk: ReturnType<typeof useLookups>;
  tid: string;
  refresh: () => Promise<void>;
}
export const AdminContext = createContext<ACtx | null>(null);
export const useA = () => {
  const c = useContext(AdminContext);
  if (!c) throw new Error("useA outside admin tournament");
  return c;
};

export function useAdminData(tid: string) {
  const t = useAdminTournament(tid);
  const b = useBundle(undefined, { admin: true, tournamentId: tid });
  const lk = useLookups(b.data);
  const qc = useQueryClient();
  const refresh = useCallback(async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["admin-t", tid] }), qc.invalidateQueries({ queryKey: ["admin-bundle", tid] })]);
  }, [qc, tid]);
  return { t, b, lk, refresh };
}

/** Run an API call with toasts, then refresh admin data. Returns the result, or undefined on error. */
export function useAct() {
  const { refresh } = useA();
  return useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const r = await fn();
        if (success) toast.success(success);
        await refresh();
        return r;
      } catch (e) {
        toast.error(errorMessage(e));
        return undefined;
      }
    },
    [refresh],
  );
}

/** Resize an image file client-side (keeps uploads small; stored in Postgres) and upload it. */
export async function uploadImage(file: File, max = 512): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Not an image"));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    const r = await api.post<{ id: string }>("/api/admin/media", { dataUrl });
    return r.id;
  } finally {
    URL.revokeObjectURL(url);
  }
}
