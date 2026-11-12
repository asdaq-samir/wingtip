import { corner, dateOf, windowOf, type FieldNotam, type NotamReading } from "./fieldNotams";
import { twoFigures } from "../../../../lib/format";

/** One labelled line of a NOTAM's times: "Since", "Starts", "Ends",
 *  "Duration". */
export type TimeLine = { label: string; value: string };

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
 * A NOTAM's times on lines of their own, labelled, in the device's own
 * time with "local" once (corner), as ForeFlight's NOTAM list gives them
 * (the owner's screenshots, 2026-11-11): one in force "Since" its start and
 * "Ends" with how long is left ("(in 18d)"); one to come "Starts" with how
 * soon, "Ends", and how long it lasts. An estimated end "(est.)", PERM
 * "Permanent" (JO 7930.2 4-2-1). The times are the planner's, else the
 * NOTAM's own (windowOf).
 */
export function timeLines(n: FieldNotam, read: NotamReading, now = Date.now()): TimeLine[] {
  const window = windowOf(n, read);
  const [starts, ends] = [dateOf(window.starts), dateOf(window.ends)];
  const active = n.in_force !== false;
  const soon = (at: Date) => (at.getTime() > now ? ` (in ${span(at.getTime() - now)})` : "");
  const lines: TimeLine[] = [];
  if (starts) lines.push({ label: active ? "Since" : "Starts", value: `${corner(starts, !ends)}${active ? "" : soon(starts)}` });
  if (ends) lines.push({ label: "Ends", value: `${corner(ends, true)}${read.estimated ? " (est.)" : ""}${soon(ends)}` });
  else if (read.permanent) lines.push({ label: "Ends", value: "Permanent" });
  if (!active && starts && ends) lines.push({ label: "Duration", value: span(ends.getTime() - starts.getTime()) });
  return lines;
}
