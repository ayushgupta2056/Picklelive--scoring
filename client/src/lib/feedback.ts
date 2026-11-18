import { useEffect } from "react";

export function vibrate(pattern: number | number[] = 25) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

let ctx: AudioContext | null = null;
export function beep(kind: "point" | "sideout" | "game" | "undo" = "point") {
  try {
    ctx ??= new AudioContext();
    const tones: Record<string, [number, number][]> = {
      point: [[880, 0.08]],
      sideout: [[440, 0.1]],
      game: [[660, 0.12], [990, 0.2]],
      undo: [[330, 0.08]],
    };
    let t = ctx.currentTime;
    for (const [f, d] of tones[kind]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + d);
      t += d;
    }
  } catch {
    /* audio blocked */
  }
}

/** Keep the screen awake while mounted (re-acquired when the tab becomes visible again). */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        /* denied */
      }
    };
    const onVis = () => document.visibilityState === "visible" && acquire();
    acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => undefined);
    };
  }, [enabled]);
}
