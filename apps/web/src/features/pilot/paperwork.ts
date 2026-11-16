import type { Due } from "../../lib/api/types";
import { callEngine } from "../../lib/engine/engine";
import type { Finding } from "../../lib/findings";

/**
 * How the paperwork list says what falls due (GET /api/paperwork, the
 * gateway's PaperworkService): the days themselves are the engine's
 * (pilot_currency, inspections_due) or the owner's own, and so is the
 * tone (due_tone, the reminders' 30 days or 10 hours); here only the words.
 */

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
function hoursWords(due: Pick<Due, "dueAtHours" | "hoursLeft">): string {
  if (due.hoursLeft == null) return due.dueAtHours == null ? "" : `At ${due.dueAtHours.toFixed(1)} h`;
  return due.hoursLeft > 0 ? `${due.hoursLeft.toFixed(1)} h to go` : "Due now";
}

/** The words for when an item falls due: by its day where it has one,
 *  else by its hours. */
export function whenWords(due: Pick<Due, "daysLeft" | "dueAtHours" | "hoursLeft">): string {
  return due.daysLeft != null ? daysWords(due.daysLeft) : hoursWords(due);
}

/** Past is a stop, within the reminders' window a caution, further off
 *  fine, by its day where it has one, else its hours, else not known: the
 *  engine's due_tone, the same on every app. */
export function dueFinding(due: Pick<Due, "daysLeft" | "hoursLeft">): Finding {
  return callEngine("due_tone", { days_left: due.daysLeft ?? null, hours_left: due.hoursLeft ?? null });
}

/** The row's title: the airplane's tail before its own items. */
export function dueTitle(due: Pick<Due, "title" | "tailNumber">): string {
  return due.tailNumber ? `${due.tailNumber} · ${due.title}` : due.title;
}

/** A figure's key as a test id's words, kebab-case as every other id is
 *  ("annualOn" is "annual-on"; the web audit's WEB-34). */
export const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
