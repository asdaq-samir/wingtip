/**
 * The calendar days the app writes, "Mon 5 Jan, 14:30", "5 Jan 2026",
 * "1/5": by hand from the date's own fields, as time.ts writes the clock
 * and for its reasons (an Intl formatter is slow to make on a phone).
 * They were date-fns's `format`, 19.5 KB of the first load for a handful
 * of patterns (the speed audit, 2026-11-10). English, as every other word
 * the app writes is, in this device's time zone.
 */
import { clockTime, twoFigures as two } from "./time";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The day of the week, short: "Mon". */
export const weekdayShort = (at: Date) => WEEKDAYS[at.getDay()]!;

/** The day and month: "5 Jan". */
export const dayMonth = (at: Date) => `${at.getDate()} ${MONTHS[at.getMonth()]}`;

/** The day, month and year: "5 Jan 2026". */
export const dayMonthYear = (at: Date) => `${dayMonth(at)} ${at.getFullYear()}`;

/** The day and month with the clock: "5 Jan, 14:30". */
export const dayMonthTime = (at: Date) => `${dayMonth(at)}, ${clockTime(at)}`;

/** The weekday, day and month with the clock: "Mon 5 Jan, 14:30". */
export const weekdayDayMonthTime = (at: Date) => `${weekdayShort(at)} ${dayMonthTime(at)}`;

/** Month and day as figures, the U.S. way: "1/5". */
export const monthSlashDay = (at: Date) => `${at.getMonth() + 1}/${at.getDate()}`;

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
  const [count, unit] =
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
  const n = Math.round(count);
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** An ISO day or time as a Date: a bare day ("2026-10-13") at this
 *  device's midnight, as the pilot means it (`new Date` reads it as UTC's,
 *  the evening before across the U.S.), anything longer as `new Date`
 *  reads it. */
export function fromIso(iso: string): Date {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(iso);
}
