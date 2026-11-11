import { describe, expect, it } from "vitest";
import { glideRangeNm, reachesField } from "./glide";

const fix = { lat: 42, lon: -88, accuracyM: 5, headingDeg: 0, at: 0 };

// The 172S's 9 to 1 (its POH, Section 3 and figure 3-1, the c172 profile's
// glide.ratio): 9,000 ft forward for each 1,000 ft down.
const RATIO = 9;
const FT_PER_NM = 1852 / 0.3048;

describe("the glide ring", () => {
  it("the airplane's own ratio over the ground, in the air", () => {
    expect(glideRangeNm({ ...fix, altitudeFt: 4800, speedKt: 100 }, 800, RATIO)).toBeCloseTo((4 * 9000) / FT_PER_NM, 9);
  });
  it("none with no glide ratio: no airplane, or none in its profile", () => {
    expect(glideRangeNm({ ...fix, altitudeFt: 4800, speedKt: 100 }, 800, null)).toBeNull();
    expect(reachesField({ ...fix, altitudeFt: 5000, speedKt: 100 }, { distance_nm: 1, elevation_ft: 600 }, null)).toBe(false);
  });
  it("none on the ground, slow, or with no altitude", () => {
    expect(glideRangeNm({ ...fix, altitudeFt: 1000, speedKt: 100 }, 800, RATIO)).toBeNull();
    expect(glideRangeNm({ ...fix, altitudeFt: 4800, speedKt: 10 }, 800, RATIO)).toBeNull();
    expect(glideRangeNm({ ...fix, altitudeFt: null, speedKt: 100 }, 800, RATIO)).toBeNull();
    expect(glideRangeNm({ ...fix, altitudeFt: 4800, speedKt: 100 }, null, RATIO)).toBeNull();
  });
});

describe("a field within a glide", () => {
  const flying = { ...fix, altitudeFt: 5000, speedKt: 100 };
  it("is judged over its own elevation, arriving at pattern height", () => {
    // 5,000 ft over a 600 ft field is 3,400 ft to spare above its pattern:
    // 5.0 nm at 9 to 1. A field 6 nm off at 2,500 ft has 1,500 ft: 2.2 nm.
    expect(reachesField(flying, { distance_nm: 5, elevation_ft: 600 }, RATIO)).toBe(true);
    expect(reachesField(flying, { distance_nm: 6, elevation_ft: 600 }, RATIO)).toBe(false);
    expect(reachesField(flying, { distance_nm: 6, elevation_ft: 2500 }, RATIO)).toBe(false);
  });
  it("is never on the ground, slow, or with a height not known", () => {
    expect(reachesField({ ...flying, speedKt: 10 }, { distance_nm: 1, elevation_ft: 600 }, RATIO)).toBe(false);
    expect(reachesField(flying, { distance_nm: 1, elevation_ft: null }, RATIO)).toBe(false);
    expect(reachesField({ ...flying, altitudeFt: 1500 }, { distance_nm: 0.5, elevation_ft: 600 }, RATIO)).toBe(false);
  });
});
