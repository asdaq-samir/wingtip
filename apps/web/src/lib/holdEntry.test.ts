import { describe, expect, test } from "vitest";
import { holdingEntry, holdingWind, legMinutes } from "./holdEntry";

// AIM 5-3-8's entries, the wind's legs and the leg's time are the engine's,
// each sector and boundary tested there (engine/facade/tests/figures/
// holding_cases.rs, and the worked examples of flightCritical.json): here,
// that the page's arguments reach "holding" and its answer is read back
// into the page's shapes.
describe("a hold, by the engine", () => {
  test("its entry, and the other one within 5° of a sector's edge, the turns passed", () => {
    expect(holdingEntry(360, 150, "right").entry).toBe("teardrop");
    expect(holdingEntry(360, 210, "left").entry).toBe("teardrop");
    expect(holdingEntry(360, 112, "right")).toEqual({ entry: "teardrop", either: "direct" });
  });

  test("in a wind, each leg's groundspeed and the outbound time, the altitude passed for the leg", () => {
    const w = holdingWind(360, 100, 360, 20, 5000)!;
    expect(w.legMin).toBe(1);
    expect(w.inbound.gs).toBeCloseTo(80, 5);
    expect(w.outbound.gs).toBeCloseTo(120, 5);
    expect(w.outboundSec).toBeCloseTo(40, 5);
    expect(holdingWind(360, 100, 90, 15, 16000)!.legMin).toBe(1.5);
    // A wind the airplane cannot hold in: nothing to show.
    expect(holdingWind(360, 50, 90, 60, 5000)).toBeNull();
  });

  test("the inbound leg's time", () => {
    expect(legMinutes(14_001)).toBe(1.5);
  });
});
