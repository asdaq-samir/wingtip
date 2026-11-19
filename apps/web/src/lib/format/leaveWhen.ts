import { monthSlashDay, weekdayShort } from "./days";
import { clockTime } from "./time";

// Its own module, off lib/format's index: only the route panel's chunk
// (the departure picker, FPL's timeline) says it, and through the index it
// rode on the first load.

/** When a flight leaves, as the departure picker and FPL's timeline say
 *  it, in a few characters, as iOS's compact picker reads:
 *  "18:00" today, "Sat 18:00" within the week, "11/17 18:00" further
 *  out -- short enough that the airplane, the time and Save, Brief and
 *  Print share one line on a phone, where the day, a time box and a
 *  cross took a line of their own, and "17 Nov 18:00" still pushed the
 *  buttons to the next. */
export function leaveWhen(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - today.getTime()) / 86_400_000);
  const time = clockTime(date);
  if (days === 0) return time;
  return `${days > 0 && days < 7 ? weekdayShort(date) : monthSlashDay(date)} ${time}`;
}
