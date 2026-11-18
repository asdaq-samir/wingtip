import { beforeEach, describe, expect, test } from "vitest";
import { forgetKeptRecord, keptRecordStore, keptRoute, readyKept } from "./keptRecord";

describe("what Keep for the Air holds, for Ready to fly", () => {
  beforeEach(() => forgetKeptRecord());

  test("before a keep, nothing is on board and nothing named missing", () => {
    expect(readyKept(null)).toEqual({ on_board: [], missing: [], size_mb: null });
  });

  test("a keep's record, its size in megabytes; a route's key names its alternate", () => {
    const route = keptRoute(["KOSH", "KMSN"], "KJVL");
    expect(readyKept({ route, at: 1, onBoard: ["briefing", "notams"], missing: ["plates"], bytes: 2_500_000 })).toEqual({
      on_board: ["briefing", "notams"],
      missing: ["plates"],
      size_mb: 2.5,
    });
    expect(keptRoute(["KOSH", "KMSN"], null)).not.toBe(route);
  });

  test("signing out forgets which route was kept", () => {
    keptRecordStore().setState({ value: { route: "a|", at: 1, onBoard: [], missing: [], bytes: 0 } });
    forgetKeptRecord();
    expect(keptRecordStore().getState().value).toBeNull();
  });
});
