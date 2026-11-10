import { describe, expect, it } from "vitest";
import type { LogbookEntry } from "../../../lib/api/types";
import { NEWEST_FIRST, nextSort, sortEntries } from "./logbookSort";

const entry = (id: number, flownOn: string, more: Partial<LogbookEntry> = {}) =>
  ({ id, flownOn, route: null, aircraft: null, remarks: null, totalHours: 1, dayLandings: 1, nightLandings: 0, ...more }) as LogbookEntry;

describe("sortEntries", () => {
  const a = entry(1, "2026-10-01", { route: "KMSN-KDLH", totalHours: 2.3, dayLandings: 2 });
  const b = entry(2, "2026-11-03", { route: "C81-KJVL", totalHours: 0.8 });
  const c = entry(3, "2026-09-12", { route: "kosh-KMSN", totalHours: 1.5, nightLandings: 3 });

  it("puts the newest first until a column is picked", () => {
    expect(sortEntries([a, b, c], NEWEST_FIRST).map((e) => e.id)).toEqual([2, 1, 3]);
  });

  it("sorts the figures as numbers and the words without regard to case", () => {
    expect(sortEntries([a, b, c], { column: "total", order: "descending" }).map((e) => e.id)).toEqual([1, 3, 2]);
    expect(sortEntries([a, b, c], { column: "landings", order: "ascending" }).map((e) => e.id)).toEqual([2, 1, 3]);
    expect(sortEntries([a, b, c], { column: "route", order: "ascending" }).map((e) => e.id)).toEqual([2, 1, 3]);
  });

  it("keeps ties newest first and leaves the given list alone", () => {
    const list = [entry(1, "2026-01-01"), entry(2, "2026-02-01")];
    expect(sortEntries(list, { column: "route", order: "ascending" }).map((e) => e.id)).toEqual([2, 1]);
    expect(list.map((e) => e.id)).toEqual([1, 2]);
  });
});

describe("nextSort", () => {
  it("turns the order round on the same column", () => {
    expect(nextSort(NEWEST_FIRST, "date")).toEqual({ column: "date", order: "ascending" });
  });
  it("starts figures from the largest and words from A", () => {
    expect(nextSort(NEWEST_FIRST, "total").order).toBe("descending");
    expect(nextSort(NEWEST_FIRST, "remarks").order).toBe("ascending");
  });
});
