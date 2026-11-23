import type { RouteStat, VersionFaults, VersionFigure } from "../../../lib/api/types";
import { figure, type Unit } from "./speedTrend";

/**
 * The owner's status page's sums (SystemTab's Apps and Routes pages): the
 * gateway's faults by build gathered into one row a build, the headline
 * speed figures picked for each platform, and the planner's routes as
 * the page says them.
 */

/** Each platform's name as the owner reads it. */
export const PLATFORM_NAMES: Record<string, string> = { web: "Web", ios: "iPhone", android: "Android", field: "Web" };

/** One build's faults: crashes, hangs (an ANR on Android, a hang on the
 *  iPhone) and the rest (exits, errors, CPU and disk exceptions). */
export interface BuildFaults {
  platform: string;
  version: string;
  crashes: number;
  hangs: number;
  other: number;
  lastAt: string;
}

/** The faults gathered a build a row, the build with the newest fault first. */
export function faultsByBuild(rows: VersionFaults[]): BuildFaults[] {
  const builds = new Map<string, BuildFaults>();
  for (const r of rows) {
    const key = `${r.platform} ${r.version}`;
    const b = builds.get(key) ?? { platform: r.platform, version: r.version, crashes: 0, hangs: 0, other: 0, lastAt: r.lastAt };
    if (r.kind === "crash") b.crashes += r.count;
    else if (r.kind === "hang") b.hangs += r.count;
    else b.other += r.count;
    if (r.lastAt > b.lastAt) b.lastAt = r.lastAt;
    builds.set(key, b);
  }
  return [...builds.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** "2 crashes · 1 hang · 3 other", leaving out what is none. */
export function faultWords(b: BuildFaults): string {
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "es"}`;
  const words = [
    b.crashes > 0 && plural(b.crashes, "crash"),
    b.hangs > 0 && `${b.hangs} hang${b.hangs === 1 ? "" : "s"}`,
    b.other > 0 && `${b.other} other`,
  ].filter(Boolean);
  return words.length ? words.join(" · ") : "none";
}

/** The figures that say a build's speed at a glance, a platform each:
 *  the Core Web Vitals by their 75th percentile, as Google judges a site
 *  (web.dev/articles/vitals); the phones' launch and their hangs or
 *  janky frames. */
const HEADLINES: { source: string; metric: string; title: string; unit: Unit | "ratio" | "s" }[] = [
  { source: "field", metric: "LCP", title: "LCP", unit: "ms" },
  { source: "field", metric: "INP", title: "INP", unit: "ms" },
  { source: "field", metric: "CLS", title: "CLS", unit: "cls" },
  { source: "web", metric: "long_task_ms", title: "Long tasks", unit: "ms" },
  { source: "ios", metric: "launch_ms_p50", title: "Launch", unit: "ms" },
  { source: "ios", metric: "hang_s", title: "Hangs", unit: "s" },
  { source: "ios", metric: "hitch_ratio", title: "Scroll hitches", unit: "ratio" },
  { source: "android", metric: "launch_ms", title: "Launch", unit: "ms" },
  { source: "android", metric: "jank_ratio", title: "Janky frames", unit: "ratio" },
];

/** One build's headline figures, said in a line: "LCP 1.8 s · INP 96 ms (40 reports)". */
export interface BuildFigures {
  platform: string;
  version: string;
  words: string;
  reports: number;
}

export function figuresByBuild(rows: VersionFigure[]): BuildFigures[] {
  const builds = new Map<string, { platform: string; version: string; parts: string[]; reports: number }>();
  for (const h of HEADLINES) {
    for (const r of rows.filter((f) => f.source === h.source && f.metric === h.metric)) {
      const platform = PLATFORM_NAMES[r.source] ?? r.source;
      const key = `${platform} ${r.version}`;
      const b = builds.get(key) ?? { platform, version: r.version, parts: [], reports: 0 };
      b.parts.push(`${h.title} ${say(r.p75, h.unit)}`);
      b.reports = Math.max(b.reports, r.count);
      builds.set(key, b);
    }
  }
  return [...builds.values()].map((b) => ({ platform: b.platform, version: b.version, words: b.parts.join(" · "), reports: b.reports }));
}

function say(value: number, unit: Unit | "ratio" | "s"): string {
  if (unit === "ratio") return `${(value * 100).toFixed(1)}%`;
  if (unit === "s") return `${value.toFixed(1)} s`;
  return figure(value, unit);
}

/** A route's line under its name: calls, failures and the times. */
export function routeWords(r: RouteStat): string {
  const times = r.p50_ms == null ? "" : ` · p50 ${figure(r.p50_ms, "ms")} · p95 ${figure(r.p95_ms ?? r.p50_ms, "ms")}`;
  const failed = r.errors > 0 ? ` · ${r.errors} failed (${(r.error_rate * 100).toFixed(1)}%)` : "";
  return `${r.count} call${r.count === 1 ? "" : "s"}${failed}${times}`;
}
