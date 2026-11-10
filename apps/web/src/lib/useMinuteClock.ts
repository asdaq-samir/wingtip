import { useEffect, useRef, useState } from "react";
import { useShown } from "./shown";

/**
 * The time now, every `everyMs`, while it is `running` and what holds it is in
 * sight (lib/shown): a clock in a tab kept hidden stops, and reads the
 * time again the moment it is back in sight, so an age it says is never
 * stale on screen and never ticks off it.
 */
export function useClock(everyMs: number, running = true): number {
  const shown = useShown();
  const [now, setNow] = useState(() => Date.now());
  const stopped = useRef(false);
  useEffect(() => {
    if (!running || !shown) {
      stopped.current = true;
      return;
    }
    const tick = () => setNow(Date.now());
    // At once on its return, then on the beat.
    const back = stopped.current ? window.setTimeout(tick, 0) : undefined;
    stopped.current = false;
    const timer = window.setInterval(tick, everyMs);
    return () => {
      window.clearTimeout(back);
      window.clearInterval(timer);
    };
  }, [everyMs, running, shown]);
  return now;
}

/** The time now, a minute at a time, for what says an age or goes out of
 *  date while it stays open: a report's "40m ago" (Observed), a nav
 *  log's winds (NavLogView). */
export function useMinuteClock(): number {
  return useClock(60_000);
}
