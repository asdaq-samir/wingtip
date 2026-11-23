import { corner, dateOf, windowOf, type FieldNotam, type NotamReading } from "./fieldNotams";
import { twoFigures } from "../../lib/format";

/** One labelled line of a NOTAM's times: "Since", "Starts", "Ends",
 *  "Duration"; `soon` how long until it ("in 18d"), which the
 *  line drops where it would not fit on one line (NotamTimeLines). */
export type TimeLine = { label: string; value: string; soon?: string };

const MINUTE = 60_000;

/** How long, as ForeFlight writes it: "5m" under an hour, "5h45m" under a
 *  day, "4d16h" under ten, "18d" past them. */
export function span(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / MINUTE));
  const [d, h, m] = [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60), minutes % 60];
  if (d >= 10) return `${d}d`;
  if (d >= 1) return h ? `${d}d${h}h` : `${d}d`;
  return h ? `${h}h${twoFigures(m)}m` : `${m}m`;
}

/**
 * A NOTAM's times, a line each, on its row and on its own card alike, in
 * the field's own time (`zone`, the planner's) with its zone's short name,
 * UTC where it is not known (corner): "Since 05/27/26 13:43 CDT", "Ends
 * 05/27/28 13:43 CDT" (the owner, 2026-11-23: "no need to say the word
 * local or Z time, just say the time zone"; "one line each"), as
 * ForeFlight's NOTAM list gives them (the owner's screenshots,
 * 2026-11-11): one in force "Since" its start and "Ends" with how long is
 * left; one to come "Starts" with how soon, "Ends", and how long it
 * lasts. An end the NOTAM marks EST (JO 7930.2 4-2-1) is said as its time
 * alone (the owner, 2026-11-23: "no need for the word estimated"). Where
 * the engine's notam_card says it runs until the charts are updated
 * (`untilCharts`, its until_charts: a permanent condition with an EST end,
 * or none), its end is "Permanent" (the owner, 2026-11-23: "for a
 * permanent, just say permanent"), as is a PERM end. The year on
 * both lines only where either is not this year's ("05/27/28"), as
 * tfrTimes says it. The times are the planner's, else the NOTAM's own
 * (windowOf).
 */
export function timeLines(n: FieldNotam, read: NotamReading, untilCharts: boolean, zone: string | null, now = Date.now()): TimeLine[] {
  const window = windowOf(n, read);
  const [starts, ends] = [dateOf(window.starts), dateOf(window.ends)];
  const active = n.in_force !== false;
  const year = new Date(now).getUTCFullYear();
  const withYear = [starts, ends].some((d) => d && d.getUTCFullYear() !== year);
  const when = (at: Date) => corner(at, zone, withYear);
  const soon = (at: Date) => (at.getTime() > now ? { soon: `in ${span(at.getTime() - now)}` } : {});
  const lines: TimeLine[] = [];
  if (starts) lines.push({ label: active ? "Since" : "Starts", value: when(starts), ...(active ? {} : soon(starts)) });
  if (untilCharts || (!ends && read.permanent)) lines.push({ label: "Ends", value: "Permanent" });
  else if (ends) lines.push({ label: "Ends", value: when(ends), ...soon(ends) });
  if (!active && starts && ends && !untilCharts) lines.push({ label: "Duration", value: span(ends.getTime() - starts.getTime()) });
  return lines;
}
