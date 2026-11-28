import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
 *  log's winds (NavLogView). One clock for them all, on the minute: each
 *  had its own interval, so a list of twenty ages drew twenty times a
 *  minute, spread over it, and two ages side by side could differ by a
 *  minute. Stopped while what holds it is out of sight (lib/shown), and
 *  while nothing reads it. */
export function useMinuteClock(): number {
  const shown = useShown();
  return useSyncExternalStore(shown ? onMinute : still, readMinute);
}

const still = () => () => {};
const minute = { now: Date.now(), listeners: new Set<() => void>(), timer: 0 };
const readMinute = () => minute.now;

function tickMinute() {
  minute.now = Date.now();
  for (const listener of minute.listeners) listener();
  minute.timer = window.setTimeout(tickMinute, 60_000 - (minute.now % 60_000));
}

function onMinute(listener: () => void) {
  minute.listeners.add(listener);
  if (minute.listeners.size === 1) {
    // Read again as the first reader comes (back in sight, a card opened),
    // then on each minute's turn.
    minute.now = Date.now();
    minute.timer = window.setTimeout(tickMinute, 60_000 - (minute.now % 60_000));
  }
  return () => {
    minute.listeners.delete(listener);
    if (minute.listeners.size === 0) window.clearTimeout(minute.timer);
  };
}
