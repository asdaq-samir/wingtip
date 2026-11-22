/**
 * The NOTAM list's coverage, said wherever NOTAMs are listed (the Brief's
 * NOTAMs that matter, features/notamRanking, and the airport card's,
 * features/place): until the planner holds the FAA's full set (NMS-API's
 * load, decision 0059, amending 0023) it holds only what the FAA's feed
 * (SWIM's FNS) has sent since the day it was first heard, so every list
 * says from when it can speak, that it is not the full set, and never that
 * there are no NOTAMs. `full` is the answer's `full_set`.
 */
const COVERAGE_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const COVERAGE_DAY_YEAR = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function coverageDay(since: string | null | undefined): Date | null {
  // The day of an ISO date or of a time ("2026-10-19T06:00:00Z").
  const day = since ? new Date(`${since.slice(0, 10)}T00:00:00Z`) : null;
  return day && !Number.isNaN(day.getTime()) ? day : null;
}

/** The line under the NOTAMs: "NOTAMs heard since 19 Oct 2026, not a
 *  full set" while the planner holds only what the feed has sent since
 *  that day; the source's name once it holds every NOTAM in force. */
export function notamCredit(since: string | null | undefined, full = false): string {
  if (full) return "FAA NOTAM System, every NOTAM in force";
  const day = coverageDay(since);
  return day ? `NOTAMs heard since ${COVERAGE_DAY_YEAR.format(day)}, not a full set` : "Recent NOTAMs only, not a full set";
}

/** What an empty NOTAM list reads, "None heard since 19 Oct": never "no
 *  NOTAMs", which would say none exist when only none were heard; "None in
 *  force" only from the full set. */
export function notamNone(since: string | null | undefined, full = false): string {
  if (full) return "None in force";
  const day = coverageDay(since);
  return day ? `None heard since ${COVERAGE_DAY.format(day)}` : "None heard";
}
