import { corner, dateOf, windowOf, type FieldNotam, type NotamReading } from "./fieldNotams";
import { twoFigures, zuluTime } from "../../lib/format";

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
 * A NOTAM's times on lines of their own, labelled, in the field's own
 * time (`zone`, the planner's) with "local" on each and UTC beside it
 * (corner; once alone, Since read as UTC beside Ends' local: UI audit
 * C11, 2026-11-17), as ForeFlight's NOTAM list gives them
 * (the owner's screenshots, 2026-11-11): one in force "Since" its start and
 * "Ends" with how long is left ("· in 18d"); one to come "Starts" with how
 * soon, "Ends", and how long it lasts. An estimated end ", estimated",
 * PERM "Permanent" (JO 7930.2 4-2-1: EST after an end is an estimate).
 * The year is said on both lines where either is not this year's
 * ("05/27/28"), as tfrTimes says it (the owner, 2026-11-23, FDC 6/3373's
 * end two years on). The times are the planner's, else the NOTAM's own
 * (windowOf).
 */
export function timeLines(n: FieldNotam, read: NotamReading, zone: string | null, now = Date.now()): TimeLine[] {
  const window = windowOf(n, read);
  const [starts, ends] = [dateOf(window.starts), dateOf(window.ends)];
  const active = n.in_force !== false;
  const year = new Date(now).getUTCFullYear();
  const withYear = [starts, ends].some((d) => d && d.getUTCFullYear() !== year);
  const when = (at: Date) => corner(at, zone, withYear);
  const soon = (at: Date) => (at.getTime() > now ? ` · in ${span(at.getTime() - now)}` : "");
  const lines: TimeLine[] = [];
  if (starts) lines.push({ label: active ? "Since" : "Starts", value: `${when(starts)}${active ? "" : soon(starts)}` });
  if (ends) lines.push({ label: "Ends", value: `${when(ends)}${read.estimated ? ", estimated" : ""}${soon(ends)}` });
  else if (read.permanent) lines.push({ label: "Ends", value: "Permanent" });
  if (!active && starts && ends) lines.push({ label: "Duration", value: span(ends.getTime() - starts.getTime()) });
  return lines;
}

/** One formatter per zone for a NOTAM card's day and clock with the
 *  zone's own short name ("27 May 2026, 13:43 CDT"), made the first time
 *  (an Intl formatter is costly to make); null where the browser does not
 *  know the zone. */
const cardFormats = new Map<string, Intl.DateTimeFormat | null>();
function cardFormat(zone: string): Intl.DateTimeFormat | null {
  if (!cardFormats.has(zone)) {
    let format: Intl.DateTimeFormat | null = null;
    try {
      const day = { day: "numeric", month: "short", year: "numeric" } as const;
      format = new Intl.DateTimeFormat("en-US", {
        ...day,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZoneName: "short",
        timeZone: zone,
      });
    } catch {
      // RangeError: a zone this browser's time-zone data does not have.
    }
    cardFormats.set(zone, format);
  }
  return cardFormats.get(zone) ?? null;
}

/** "27 May 2026, 13:43 CDT" in the field's own time (the planner's
 *  zone), the year only where `year`; UTC where the zone is not known
 *  ("27 May 2026, 1843Z"), never the device's own time called the
 *  field's. `clock` false says the day alone. */
function cardWhen(at: Date, zone: string | null, year: boolean, clock = true): string {
  const format = zone ? cardFormat(zone) : null;
  const p: Record<string, string | undefined> = format
    ? Object.fromEntries(format.formatToParts(at).map((x) => [x.type, x.value]))
    : { day: String(at.getUTCDate()), month: UTC_MONTHS[at.getUTCMonth()], year: String(at.getUTCFullYear()) };
  const day = `${p.day} ${p.month}${year ? ` ${p.year}` : ""}`;
  if (!clock) return day;
  return format ? `${day}, ${p.hour}:${p.minute} ${p.timeZoneName}` : `${day}, ${zuluTime(at)}`;
}
const UTC_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A NOTAM's times on its own card, in words (the owner, 2026-11-23, of
 * FDC 6/3373): "In effect since 27 May 2026, 13:43 CDT", or "Starts ... ·
 * in 5h45m"; its end "Until ...", estimated where EST says so (JO 7930.2
 * 4-2-1), with how long is left. A permanent condition (`permanent`, the
 * engine's notam_card: PERM, or PERMANENTLY in its words) stays until the
 * charts show it, its EST end the estimate of when: "Until charts are
 * updated (est. 27 May 2028)". The year where either end is not this
 * year's, as tfrTimes says it.
 */
export function cardTimes(n: FieldNotam, read: NotamReading, permanent: boolean, zone: string | null, now = Date.now()): string[] {
  const window = windowOf(n, read);
  const [starts, ends] = [dateOf(window.starts), dateOf(window.ends)];
  const year = new Date(now).getUTCFullYear();
  const withYear = [starts, ends].some((d) => d && d.getUTCFullYear() !== year);
  const soon = (at: Date) => (at.getTime() > now ? ` · in ${span(at.getTime() - now)}` : "");
  const lines: string[] = [];
  if (starts)
    lines.push(
      n.in_force !== false
        ? `In effect since ${cardWhen(starts, zone, withYear)}`
        : `Starts ${cardWhen(starts, zone, withYear)}${soon(starts)}`,
    );
  if (permanent && (read.estimated || !ends)) {
    lines.push(ends ? `Until charts are updated (est. ${cardWhen(ends, zone, withYear, false)})` : "Until charts are updated");
  } else if (ends) {
    lines.push(`Until ${cardWhen(ends, zone, withYear)}${read.estimated ? ", estimated" : ""}${soon(ends)}`);
  }
  return lines;
}
