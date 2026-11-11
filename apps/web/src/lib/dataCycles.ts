import { dayMonthYear } from "./format/days";
import type { DataCycle } from "./api/types";
import { andList } from "./listWords";

/**
 * The FAA data the planner uses, in a pilot's words, where an edition is
 * past its cycle. Whether it is, is the engine's rule (`data_cycle`, from
 * the FAA's 28 and 56 Day Product Schedule), worked out by the planner and
 * sent with the map's ages (/api/map/ages `data_cycles`); only the words
 * are here. An old edition is still used -- warn, never limit (the owner,
 * 2026-10-23) -- and said once, where it matters: the Status page's rows,
 * the map settings' Charts row and a line in the Brief.
 */

/** A day the planner sends ("2026-10-29") as the pilot reads it, "29 Oct
 *  2026"; the text as sent where it is not a day. */
export function dayWords(day: string | null | undefined): string {
  if (!day) return "—";
  const [year, month, date] = day.split("-").map(Number);
  const at = new Date(year!, (month ?? 1) - 1, date);
  return Number.isNaN(at.getTime()) ? day : dayMonthYear(at);
}

/** The data sets past their cycle. */
export function outOfDate(cycles: readonly DataCycle[] | null | undefined): DataCycle[] {
  return (cycles ?? []).filter((c) => c.state === "expired");
}

/** Under a data set's row, when it is past its cycle: since when, and
 *  how many editions it is behind where that is more than one; null while
 *  it is in force. */
export function cycleWarning(c: DataCycle): string | null {
  if (c.state !== "expired") return null;
  const behind = (c.behind ?? 0) > 1 ? `, ${c.behind} editions behind` : "";
  return `Out of date since ${dayWords(c.expires)}${behind}`;
}

/** Each data set's name inside a sentence. */
const SHORT: Record<string, string> = {
  nasr: "airports and frequencies",
  charts: "charts",
  cifp: "procedures",
  dof: "obstacles",
  packs: "offline packs",
};

/** One line for the Brief when any data set the plan rests on is past its
 *  cycle, null when none is: "FAA data out of date: charts and
 *  procedures". */
export function dataWarning(cycles: readonly DataCycle[] | null | undefined): string | null {
  const names = outOfDate(cycles).map((c) => SHORT[c.key] ?? c.name.toLowerCase());
  if (!names.length) return null;
  const list = andList(names);
  return `FAA data out of date: ${list}`;
}
