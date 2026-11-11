import type { LogbookEntry } from "../../../lib/api/types";

/**
 * The desktop logbook table's sort (LogbookTable): a column's header
 * picked sorts by it, picked again turns the order round, as a data
 * table's headers do (the APG's table pattern, with aria-sort on the
 * header sorted by). Newest first until one is picked, as the list is.
 * Nothing is reckoned: the rows are the gateway's, only ordered.
 */
export type LogbookColumn = "date" | "route" | "airplane" | "total" | "landings" | "remarks";
type SortOrder = "ascending" | "descending";
export interface LogbookSort {
  column: LogbookColumn;
  order: SortOrder;
}

export const NEWEST_FIRST: LogbookSort = { column: "date", order: "descending" };

/** What a column sorts on: the figures as numbers, the words as words. */
function keyOf(e: LogbookEntry, column: LogbookColumn): string | number {
  switch (column) {
    case "date":
      return e.flownOn;
    case "route":
      return e.route ?? "";
    case "airplane":
      return e.aircraft ?? "";
    case "total":
      return e.totalHours;
    case "landings":
      return e.dayLandings + e.nightLandings;
    case "remarks":
      return e.remarks ?? "";
  }
}

/** The entries in the sort's order; ties keep the newest first, so two
 *  flights on one route still read in time. A new array, the given one
 *  left as it is. */
export function sortEntries(entries: readonly LogbookEntry[], sort: LogbookSort): LogbookEntry[] {
  const sign = sort.order === "ascending" ? 1 : -1;
  return [...entries].sort((a, b) => {
    const x = keyOf(a, sort.column);
    const y = keyOf(b, sort.column);
    const by =
      typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { sensitivity: "base" });
    if (by !== 0) return by * sign;
    return b.flownOn.localeCompare(a.flownOn) || b.id - a.id;
  });
}

/** A header picked: its column, descending for the date and the figures
 *  (the newest, the longest first), ascending for words; picked again,
 *  the other way. */
export function nextSort(now: LogbookSort, column: LogbookColumn): LogbookSort {
  if (now.column === column) return { column, order: now.order === "ascending" ? "descending" : "ascending" };
  const figures = column === "date" || column === "total" || column === "landings";
  return { column, order: figures ? "descending" : "ascending" };
}
