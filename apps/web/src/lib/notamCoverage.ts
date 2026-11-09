/**
 * The NOTAM list's coverage, said wherever NOTAMs are listed (the Brief's
 * NOTAMs that matter, features/notamRanking): the planner holds only what
 * the FAA's feed (SWIM's FNS) has sent since the day it was first heard
 * (the owner, 2026-11-09, docs/decisions/0023), so every list says from
 * when it can speak and never that there are no NOTAMs.
 */
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
