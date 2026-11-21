import { useEffect } from "react";

/**
 * The screen kept on while `on` (flying mode), by the stock Screen Wake
 * Lock API, as EFBs keep it in flight: a phone that dimmed and locked on
 * its own timer took the map, the head and the copilot's voice with it,
 * since Safari suspends a hidden page (the in-flight audit, the owner's
 * Q2, 2026-11-21). The browser lets the lock go as the page is hidden, so
 * it is taken again as the page comes back; it goes with flying mode (the
 * ground, Done flying). Where the API is missing or refuses (low battery,
 * a browser's own policy) the screen dims as before: no error to say.
 */
export function useScreenAwake(on: boolean): void {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const take = () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      navigator.wakeLock
        .request("screen")
        .then((got) => {
          if (gone) void got.release();
          else lock = got;
        })
        .catch(() => undefined);
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => undefined);
    };
  }, [on]);
}
