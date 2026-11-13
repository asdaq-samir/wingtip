import type { LogbookEntryRequest } from "../../../lib/api/types";

/** What a field of the form needs, said under it, by its key. */
export type EntryProblems = Partial<Record<keyof LogbookEntryRequest, string>>;

/**
 * What the gateway cannot log a flight without, found before it is asked,
 * so the form says it under the field rather than greying Save out: the
 * day it was flown, which every logbook row and every currency window
 * counts from (14 CFR 61.57's "preceding 90 days" is days from it). The
 * figures are the pilot's own and are not limited here (warn, never limit).
 */
export function entryProblems(entry: LogbookEntryRequest): EntryProblems {
  const problems: EntryProblems = {};
  if (!entry.flownOn) problems.flownOn = "Enter the day you flew.";
  return problems;
}
