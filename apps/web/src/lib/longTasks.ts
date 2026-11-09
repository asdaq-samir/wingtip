import { beacon, originOf, type DiagnosticsReport } from "./diagnostics";
import { pageOf } from "./speed";

/**
 * How long the page kept the main thread busy on this pilot's device: the
 * browser's Long Tasks (w3c.github.io/longtasks), each a stretch of 50 ms
 * or more in which a tap could not be answered and the map could not
 * draw -- the web's measure of the dropped frames the phones count. Their
 * number, their total and the longest go to the speed trend as the page
 * is put away (lib/diagnostics), beside the Core Web Vitals (lib/speed),
 * and again only if more came since. Nothing of the pilot's goes.
 *
 * Safari has no Long Tasks: there it measures nothing and sends nothing.
 * Not in a browser driven by tests, as lib/speed.
 */
export function startLongTaskReports(win: Window = window) {
  if (win.navigator.webdriver || typeof PerformanceObserver === "undefined"
    || !PerformanceObserver.supportedEntryTypes?.includes("longtask")) return;
  const seen: number[] = [];
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) seen.push(entry.duration);
  }).observe({ type: "longtask", buffered: true });
  win.document.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState !== "hidden" || seen.length === 0) return;
    beacon(longTaskReport(seen.splice(0), pageOf(win.location.pathname), originOf(win)));
  });
}

/** The report for a page's long tasks, in whole milliseconds. */
export function longTaskReport(durations: number[], page: string,
  origin: Pick<DiagnosticsReport, "platform" | "version" | "device">): DiagnosticsReport {
  const total = durations.reduce((sum, d) => sum + d, 0);
  return {
    ...origin, page,
    metrics: { long_tasks: durations.length, long_task_ms: Math.round(total), longest_task_ms: Math.round(Math.max(...durations)) },
  };
}
