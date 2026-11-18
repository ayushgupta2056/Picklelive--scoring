import { createContext, useContext } from "react";
import type { TournamentBundle } from "@shared/api";
import type { useLookups } from "@/hooks/useBundle";

export interface TCtx {
  b: TournamentBundle;
  lk: ReturnType<typeof useLookups>;
  slug: string;
  base: string;
}
export const TournamentContext = createContext<TCtx | null>(null);
export function useT(): TCtx {
  const c = useContext(TournamentContext);
  if (!c) throw new Error("useT outside tournament");
  return c;
}
