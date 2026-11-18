import { useEffect, useRef } from "react";

/**
 * Calls `callback` every `intervalMs` while `enabled`, skipping ticks while the
 * browser tab is hidden and refreshing immediately when it becomes visible again.
 */
export function usePolling(callback: () => void, intervalMs: number, enabled: boolean) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const tick = () => { if (document.visibilityState === "visible") saved.current(); };
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") saved.current(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}
