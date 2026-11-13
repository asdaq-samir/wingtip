import type { ProficiencyPlan } from "./coachApi";

/** The step the coach is on, in words, for the page's status line: said
 *  to a screen reader as each comes, without taking the focus (WCAG
 *  4.1.3; docs/design/web.md §10). Nothing to say, empty. */
export function coachStep(c: { making: boolean; plan: ProficiencyPlan | null; ready: boolean }): string {
  if (!c.ready) return "Reading your logbook…";
  if (c.making) return "Reading your logbook and your flights' debriefs…";
  if (c.plan) return `Plan made: ${c.plan.sessions.length} ${c.plan.sessions.length === 1 ? "session" : "sessions"}.`;
  return "";
}
