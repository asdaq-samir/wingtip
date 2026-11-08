import type { Due } from "./api/types";
import type { Finding } from "./findings";

/**
 * How the paperwork list says what falls due (GET /api/paperwork, the
 * gateway's PaperworkService): the days themselves are the engine's
 * (pilot_currency, inspections_due) or the owner's own; here only the
 * words and the tone. The 30 days are the reminders' own window
 * (ReminderService: an email 30 and 7 days before), not a rule's.
 */

/** Within this many days, a thing is coming up: the reminders' first email. */
export const SOON_DAYS = 30;
/** Within this many hours of time in service, an hour-counted item is
 *  coming up: about a fortnight's flying for an airplane flown for hire. */
export const SOON_HOURS = 10;

/** Days between two ISO days, `to` less `from`: counted on the calendar,
 *  at noon UTC, so no clock change makes a day 23 hours. */
export function daysBetween(from: string, to: string): number {
  const at = (day: string) => Date.parse(`${day}T12:00:00Z`);
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/** "Today", "Tomorrow", "In 22 days", "Yesterday", "3 days past". */
export function daysWords(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 1 ? `In ${days} days` : `${-days} days past`;
}

/** What is left of an hour-counted item: "19.5 h to go", "Due now",
 *  "At 2350.0 h" where the hours now are not known. */
export function hoursWords(due: Pick<Due, "dueAtHours" | "hoursLeft">): string {
  if (due.hoursLeft == null) return due.dueAtHours == null ? "" : `At ${due.dueAtHours.toFixed(1)} h`;
  return due.hoursLeft > 0 ? `${due.hoursLeft.toFixed(1)} h to go` : "Due now";
}

/** The words for when an item falls due: by its day where it has one,
 *  else by its hours. */
export function whenWords(due: Pick<Due, "daysLeft" | "dueAtHours" | "hoursLeft">): string {
  return due.daysLeft != null ? daysWords(due.daysLeft) : hoursWords(due);
}

/** Past is a stop, within the window a caution, further off fine; by its
 *  day where it has one, else its hours, else not known. */
export function dueTone(due: Pick<Due, "daysLeft" | "hoursLeft">): Finding {
  if (due.daysLeft != null) return due.daysLeft < 0 ? "stop" : due.daysLeft <= SOON_DAYS ? "caution" : "ok";
  if (due.hoursLeft != null) return due.hoursLeft <= 0 ? "stop" : due.hoursLeft <= SOON_HOURS ? "caution" : "ok";
  return "unknown";
}

/** The row's title: the airplane's tail before its own items. */
export function dueTitle(due: Pick<Due, "title" | "tailNumber">): string {
  return due.tailNumber ? `${due.tailNumber} · ${due.title}` : due.title;
}
