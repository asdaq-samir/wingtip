import { useEffect, useState } from "react";

/** The time now, a minute at a time, for what says an age or goes out of
 *  date while it stays open: a report's "40m ago" (Observed), a nav
 *  log's winds (NavLogView). */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
