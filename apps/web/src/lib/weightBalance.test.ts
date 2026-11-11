import { describe, expect, it } from "vitest";
import c172Json from "../../../../data/aircraft/c172.json?raw";
import type { Loading } from "./api/types";
import { balance, defaultLoad } from "./weightBalance";

// The stock profile itself (data/aircraft), the 172S's POH figures in it.
const c172 = JSON.parse(c172Json);
const loading = c172.loading as Loading;

describe("weight and balance, the 172S's", () => {
  it("the POH's own sample loading weighs 2,550 lb at takeoff, within the envelope", () => {
    // Figure 6-5's sample: empty 1,642 lb at 62.6 (thousand lb-in), 30 gal,
    // 340 lb in front, 340 behind, 56 lb of baggage in area 1 -- at its
    // arm of 95 in (the sample puts it at 82, the area's front).
    const b = balance(loading, { emptyWeightLb: 1642, emptyArmIn: 62600 / 1642, stationsLb: [340, 340, 56, 0], fuelGal: 30 }, 0);
    expect(b.takeoff.weightLb).toBe(2550);
    expect(b.takeoff.armIn).toBeCloseTo((62600 + 180 * 48 + 340 * 37 + 340 * 73 + 56 * 95 - 8 * 48) / 2550, 6);
    expect(b.problems).toEqual([]);
  });

  it("over its weight, and the baggage over its own", () => {
    const b = balance(loading, { emptyWeightLb: 1642, emptyArmIn: 38.1, stationsLb: [170, 400, 120, 50], fuelGal: 53 }, 10);
    expect(b.problems).toContain("The takeoff weight, 2,692 lb, is 142 lb over its most");
    expect(b.problems).toContain("The baggage, 170 lb in all, is over its 120 lb");
  });

  it("the default load is the sample airplane and a pilot", () => {
    expect(defaultLoad(loading, 40)).toEqual({ emptyWeightLb: 1642, emptyArmIn: 38.12, stationsLb: [170, 0, 0, 0], fuelGal: 40 });
  });
});
