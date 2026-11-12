import { describe, expect, it } from "vitest";
import { UNLIMITED_DRAWN_TO_FT, altitudeM, groundSpan, needsGround, volumeSpan } from "./airspaceHeights";

const FT = 0.3048;

describe("altitudeM", () => {
  it("draws an MSL height as it is, whatever the ground", () => {
    // O'Hare's Class B surface area to 10,000 MSL.
    expect(altitudeM(10_000, "MSL", 200)).toBeCloseTo(10_000 * FT, 6);
    // A flight level is drawn as if MSL.
    expect(altitudeM(18_000, "STD", 500)).toBeCloseTo(18_000 * FT, 6);
    // No reference: MSL, as the NASR file's ceilings are.
    expect(altitudeM(4_000, null, 100)).toBeCloseTo(4_000 * FT, 6);
  });

  it("draws an AGL height, and SFC with a figure, over the ground", () => {
    expect(altitudeM(700, "AGL", 450)).toBeCloseTo(450 + 700 * FT, 6);
    // Brady Low MOA's floor: SFC with 500 is 500 ft above the surface.
    expect(altitudeM(500, "SFC", 450)).toBeCloseTo(450 + 500 * FT, 6);
    // The surface itself is drawn from the sea up, the ground hiding it.
    expect(altitudeM(0, "SFC", 450)).toBe(0);
  });
});

describe("volumeSpan", () => {
  it("stands an MSL shelf at its true altitudes, no ground needed", () => {
    // A Chicago Class B shelf, 3,000 to 10,000 MSL.
    const v = { floorFt: 3_000, floorRef: "MSL", ceilingFt: 10_000, ceilingRef: "MSL" };
    expect(needsGround(v)).toBe(false);
    expect(volumeSpan(v, null)).toEqual({ floorM: expect.closeTo(3_000 * FT, 6), ceilingM: expect.closeTo(10_000 * FT, 6) });
  });

  it("draws a to-but-not-including ceiling at its figure", () => {
    // A Class D to but not including 3,000 under a Class B shelf: its top
    // at 3,000, where the shelf's floor begins.
    const d = volumeSpan({ floorFt: 0, floorRef: "SFC", ceilingFt: 3_000, ceilingRef: "MSL" }, null)!;
    const shelf = volumeSpan({ floorFt: 3_000, floorRef: "MSL", ceilingFt: 10_000, ceilingRef: "MSL" }, null)!;
    expect(d.ceilingM).toBeCloseTo(shelf.floorM, 6);
  });

  it("lifts an AGL floor over the lowest ground under it: Brady Low MOA", () => {
    // 500 ft AGL to 6,000 MSL over ground from 450 to 610 m: the floor
    // over the lowest, so it is never drawn higher than it is anywhere.
    const v = { floorFt: 500, floorRef: "SFC", ceilingFt: 6_000, ceilingRef: "MSL" };
    expect(needsGround(v)).toBe(true);
    expect(volumeSpan(v, null)).toBeNull();
    const s = volumeSpan(v, { low: 450, high: 610 })!;
    expect(s.floorM).toBeCloseTo(450 + 500 * FT, 6);
    expect(s.ceilingM).toBeCloseTo(6_000 * FT, 6);
  });

  it("raises an AGL ceiling over the highest ground under it", () => {
    // Steelhead Low North MOA: 500 to 1,500 ft above the surface.
    const s = volumeSpan({ floorFt: 500, floorRef: "SFC", ceilingFt: 1_500, ceilingRef: "SFC" }, { low: 180, high: 260 })!;
    expect(s.ceilingM).toBeCloseTo(260 + 1_500 * FT, 6);
  });

  it("draws an unlimited area, or one above it, to the floor of Class A", () => {
    // 14 CFR 71.33: Class A from 18,000 ft MSL, never drawn itself.
    const unl = volumeSpan({ floorFt: 0, floorRef: "SFC", ceilingFt: null, ceilingRef: "UNL" }, null)!;
    expect(unl.ceilingM).toBeCloseTo(UNLIMITED_DRAWN_TO_FT * FT, 6);
    // R-4207 to FL450.
    const high = volumeSpan({ floorFt: 0, floorRef: "SFC", ceilingFt: 45_000, ceilingRef: "STD" }, null)!;
    expect(high.ceilingM).toBeCloseTo(UNLIMITED_DRAWN_TO_FT * FT, 6);
  });

  it("draws nothing whose floor is at or over the drawn top", () => {
    expect(volumeSpan({ floorFt: 18_000, floorRef: "STD", ceilingFt: 45_000, ceilingRef: "STD" }, null)).toBeNull();
  });
});

describe("groundSpan", () => {
  it("is the lowest and highest the terrain reads, none where it has none in", () => {
    const heights = [120, null, 300, 80];
    let i = 0;
    expect(
      groundSpan(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        () => heights[i++] ?? null,
      ),
    ).toEqual({ low: 80, high: 300 });
    expect(groundSpan([[0, 0]], () => null)).toBeNull();
  });
});
