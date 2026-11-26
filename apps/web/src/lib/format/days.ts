/**
 * The calendar days the app writes, "Mon 5 Jan, 14:30", "5 Jan 2026",
 * "1/5". They were date-fns's `format`, 19.5 KB of the first load for a
 * handful of patterns (the speed audit, 2026-11-10). English, as every
 * other word the app writes is, in this device's time zone.
 *
 * The browser's Intl writes those it writes the same: the weekday, "1/5"
 * and a distance's words. Each formatter is made the first time it is
 * asked for, never at load (time.ts says what one costs to make on a
 * phone). The day before the month is written by hand: en-US puts the
 * month first ("Jan 5") and en-GB writes September "Sept" (CLDR, checked
 * in Node 24, 2026-11-12), and a U.S. form's "01-05-2026" is no locale's.
 */
import { clockTime, twoFigures as two } from "./time";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A value made the first time it is asked for, then kept. */
function lazy<T>(make: () => T): () => T {
  let made: T | undefined;
  return () => (made ??= make());
}

const weekday = lazy(() => new Intl.DateTimeFormat("en-US", { weekday: "short" }));
const monthDay = lazy(() => new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric" }));

/** The day of the week, short: "Mon". */
export const weekdayShort = (at: Date) => weekday().format(at);

/** The day and month: "5 Jan". */
export const dayMonth = (at: Date) => `${at.getDate()} ${MONTHS[at.getMonth()]}`;

/** The day, month and year: "5 Jan 2026". */
export const dayMonthYear = (at: Date) => `${dayMonth(at)} ${at.getFullYear()}`;

/** The day and month with the clock: "5 Jan, 14:30". */
export const dayMonthTime = (at: Date) => `${dayMonth(at)}, ${clockTime(at)}`;

/** The weekday, day and month with the clock: "Mon 5 Jan, 14:30". */
export const weekdayDayMonthTime = (at: Date) => `${weekdayShort(at)} ${dayMonthTime(at)}`;

/** Month and day as figures, the U.S. way: "1/5". */
export const monthSlashDay = (at: Date) => monthDay().format(at);

/** A U.S. form's date: "01-05-2026" (an advisory circular's endorsement). */
export const usFormDay = (at: Date) => `${two(at.getMonth() + 1)}-${two(at.getDate())}-${at.getFullYear()}`;

/**
 * How far apart two times are in the one unit that fits, rounded: "30
 * seconds", "5 minutes", "3 hours", "1 day", "2 months", "1 year" (as
 * date-fns's formatDistanceStrict wrote it). A month is 30 days and a
 * year 365, which is close enough for "the next card is due in".
 */
export function strictDistance(a: Date | number, b: Date | number): string {
  const seconds = Math.abs(Number(a) - Number(b)) / 1000;
  const [count, unit]: [number, string] =
    seconds < 60
      ? [seconds, "second"]
      : seconds < 3600
        ? [seconds / 60, "minute"]
        : seconds < 86_400
          ? [seconds / 3600, "hour"]
          : seconds < 30 * 86_400
            ? [seconds / 86_400, "day"]
            : seconds < 365 * 86_400
              ? [seconds / (30 * 86_400), "month"]
              : [seconds / (365 * 86_400), "year"];
  return unitWords(unit).format(Math.round(count));
}

const unitFormats = new Map<string, Intl.NumberFormat>();
/** The unit in words, "1 day", "14 days", Intl's plural rather than ours. */
function unitWords(unit: string): Intl.NumberFormat {
  let format = unitFormats.get(unit);
  if (!format) {
    format = new Intl.NumberFormat("en-US", { style: "unit", unit, unitDisplay: "long" });
    unitFormats.set(unit, format);
  }
  return format;
}

/** An ISO day or time as a Date: a bare day ("2026-10-13") at this
 *  device's midnight, as the pilot means it (`new Date` reads it as UTC's,
 *  the evening before across the U.S.), anything longer as `new Date`
 *  reads it. */
export function fromIso(iso: string): Date {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(iso);
}
