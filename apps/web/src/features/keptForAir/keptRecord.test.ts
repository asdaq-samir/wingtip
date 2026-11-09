import { beforeEach, describe, expect, test } from "vitest";
import { forgetKeptRecord, keptRecord, keptRecordStore, keptRoute, readyKept } from "./keptRecord";

describe("what Keep for the Air holds, for Ready to fly", () => {
  beforeEach(() => forgetKeptRecord());

  test("before a keep, nothing is on board and nothing named missing", () => {
    expect(readyKept(null)).toEqual({ on_board: [], missing: [], size_mb: null });
  });

  test("a keep's record is the route's alone, its size in megabytes", () => {
    const route = keptRoute(["KOSH", "KMSN"], "KJVL");
    keptRecordStore().setState({ value: { route, at: 1, onBoard: ["briefing", "notams"], missing: ["plates"], bytes: 2_500_000 } });
    expect(readyKept(keptRecord(route))).toEqual({ on_board: ["briefing", "notams"], missing: ["plates"], size_mb: 2.5 });
    expect(keptRecord(keptRoute(["KOSH", "KMSN"], null))).toBeNull();
  });

  test("signing out forgets which route was kept", () => {
    keptRecordStore().setState({ value: { route: "a|", at: 1, onBoard: [], missing: [], bytes: 0 } });
    forgetKeptRecord();
    expect(keptRecordStore().getState().value).toBeNull();
  });
});
