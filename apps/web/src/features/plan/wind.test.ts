import { describe, expect, it } from "vitest";
import { calmOnRunway, crosswindKt, headwindKt, isCalm, runwayCrosswindKt, steadyOrGustKt } from "./wind";

// A wind's parts, its gusts' crosswind and calm are the engine's, each sign,
// seam and boundary tested there (engine/facade/tests/runway/wind_cases.rs):
// here, that each function's arguments reach its call and the right field
// of the answer is read back.
describe("a wind's parts on a runway", () => {
  it("reads the headwind and the crosswind each from its own field", () => {
    // 300° at 20 kt on runway 27 (270° true): 30° off, cos 30° 17.3 along, sin 30° 10 across.
    expect(headwindKt(300, 20, 270)).toBeCloseTo(17.32, 2);
    expect(crosswindKt(300, 20, 270)).toBeCloseTo(10, 6);
  });

  it("passes the steady crosswind and the gust's, and a runway's wind, for the one it is judged by", () => {
    expect(steadyOrGustKt(-6, 9)).toBe(9);
    expect(runwayCrosswindKt({ crosswind_kt: -4, gust_crosswind_kt: -11 })).toBe(11);
  });
});

describe("calm", () => {
  it("is a speed of nothing, and a speed the page does not have is sent as not reported", () => {
    expect(isCalm(0)).toBe(true);
    expect(isCalm(undefined)).toBe(false);
  });

  it("is asked of a runway's wind as the planner sends it", () => {
    expect(calmOnRunway({ end: "18", headwind_kt: 0, crosswind_kt: 0, gust_crosswind_kt: null })).toBe(true);
  });
});
