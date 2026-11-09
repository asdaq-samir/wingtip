import { altFt } from "../../format";
import type { SuaWhen, TfrWhen } from "../../../../lib/passTimes";
import type { Finding } from "../../../../lib/findings";

// The words the briefing's parts share (FlightBriefingView), apart from
// the small parts that draw them (BriefingBits).

/** The altitude range a hazard covers, worded around whichever bound
 *  is actually known -- an advisory with no upper limit reported (or
 *  no lower one) is common, and "—-35,000 ft" reads like a typo. */
export function hazardAltitudeRange(lowFt: number | null, highFt: number | null): string | null {
  if (lowFt == null && highFt == null) return null;
  if (lowFt == null) return `up to ${altFt(highFt)} ft`;
  if (highFt == null) return `${altFt(lowFt)} ft and above`;
  return `${altFt(lowFt)}-${altFt(highFt)} ft`;
}

/** What a special-use area's times of use say for the pass (lib/passTimes). */
export const SUA_WORDS: Record<SuaWhen, string> = {
  "active": "scheduled in use then",
  "by-notam": "not scheduled then, but a NOTAM can activate it",
  "not-scheduled": "not scheduled then",
  "unknown": "read its times against yours",
};
export const SUA_FINDING: Record<SuaWhen, Finding> = {
  "active": "stop",
  "by-notam": "caution",
  "not-scheduled": "ok",
  "unknown": "caution",
};
export const TFR_WORDS: Record<TfrWhen, string> = {
  "in-force": "in force then",
  "before": "before it starts",
  "after": "after it ends",
};

const COVERAGE_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const COVERAGE_DAY_YEAR = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function coverageDay(since: string | null | undefined): Date | null {
  const day = since ? new Date(`${since}T00:00:00Z`) : null;
  return day && !Number.isNaN(day.getTime()) ? day : null;
}

/** The credit under the NOTAM words, "FAA NOTAM feed since 19 Oct 2026":
 *  the planner holds only what the feed (SWIM's FNS) has sent since the
 *  day it was first heard, so the line says from when the list can speak
 *  (the owner, 2026-11-09). `since` is the answer's ISO date. */
export function notamCredit(since: string | null | undefined): string {
  const day = coverageDay(since);
  return day ? `FAA NOTAM feed since ${COVERAGE_DAY_YEAR.format(day)}` : "FAA NOTAM feed";
}

/** What an empty NOTAM list reads, "None heard since 19 Oct": never "no
 *  NOTAMs", which would say none exist when only none were heard. */
export function notamNone(since: string | null | undefined): string {
  const day = coverageDay(since);
  return day ? `None heard since ${COVERAGE_DAY.format(day)}` : "None heard";
}
