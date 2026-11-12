import { describe, expect, it } from "vitest";
import { UNLIMITED_DRAWN_TO_FT, aboveGroundM, extrusionHeights, meanGround, vertexCentroids } from "./airspaceHeights";
import { DRAWN, heightsOf } from "./tileVolumes";

const FT = 0.3048;

describe("aboveGroundM", () => {
  it("gives an MSL height less the ground MapLibre stands the volume on", () => {
    // O'Hare's Class B surface area to 10,000 MSL over ground at 200 m.
    expect(aboveGroundM(10_000, "MSL", 200)).toBeCloseTo(10_000 * FT - 200, 6);
    // A flight level is drawn as if MSL.
    expect(aboveGroundM(18_000, "STD", 500)).toBeCloseTo(18_000 * FT - 500, 6);
    // No reference: MSL, as the NASR file's ceilings are.
    expect(aboveGroundM(4_000, null, 100)).toBeCloseTo(4_000 * FT - 100, 6);
  });

  it("gives an AGL height, and SFC with a figure, as it is", () => {
    expect(aboveGroundM(700, "AGL", 450)).toBeCloseTo(700 * FT, 6);
    // Brady Low MOA's floor: SFC with 500 is 500 ft above the surface.
    expect(aboveGroundM(500, "SFC", 450)).toBeCloseTo(500 * FT, 6);
    expect(aboveGroundM(0, "SFC", 450)).toBe(0);
  });
});

describe("extrusionHeights", () => {
  it("stands an MSL shelf at its true altitude over the ground", () => {
    // A Chicago Class B shelf, 3,000 to 10,000 MSL, over 190 m of ground:
    // base + ground and height + ground land on the MSL figures.
    const h = extrusionHeights({ floorFt: 3_000, floorRef: "MSL", ceilingFt: 10_000, ceilingRef: "MSL" }, 190)!;
    expect(h.base + 190).toBeCloseTo(3_000 * FT, 6);
    expect(h.height + 190).toBeCloseTo(10_000 * FT, 6);
  });

  it("starts a surface volume on the ground", () => {
    const h = extrusionHeights({ floorFt: 0, floorRef: "SFC", ceilingFt: 2_500, ceilingRef: "MSL" }, 200)!;
    expect(h.base).toBe(0);
    expect(h.height).toBeCloseTo(2_500 * FT - 200, 6);
  });

  it("draws a to-but-not-including ceiling at its figure", () => {
    // A Class D to but not including 3,000 under a Class B shelf: its top
    // at 3,000, where the shelf's floor begins.
    const d = extrusionHeights({ floorFt: 0, floorRef: "SFC", ceilingFt: 3_000, ceilingRef: "MSL" }, 180)!;
    const shelf = extrusionHeights({ floorFt: 3_000, floorRef: "MSL", ceilingFt: 10_000, ceilingRef: "MSL" }, 180)!;
    expect(d.height).toBeCloseTo(shelf.base, 6);
  });

  it("lifts an AGL floor over an MSL ceiling: Brady Low MOA", () => {
    // 500 ft AGL to (not including) FL180 over ground at 520 m.
    const h = extrusionHeights({ floorFt: 500, floorRef: "SFC", ceilingFt: 18_000, ceilingRef: "MSL" }, 520)!;
    expect(h.base).toBeCloseTo(500 * FT, 6);
    expect(h.height + 520).toBeCloseTo(18_000 * FT, 6);
  });

  it("draws an unlimited area to the floor of Class A", () => {
    const h = extrusionHeights({ floorFt: 0, floorRef: "SFC", ceilingFt: null, ceilingRef: null }, 300)!;
    expect(h.height + 300).toBeCloseTo(UNLIMITED_DRAWN_TO_FT * FT, 6);
  });

  it("draws nothing under the ground or over the drawn top", () => {
    // A ceiling below the ground at the centroid.
    expect(extrusionHeights({ floorFt: 0, floorRef: "SFC", ceilingFt: 500, ceilingRef: "MSL" }, 600)).toBeNull();
    // From FL180 to unlimited: Class A's, not drawn.
    expect(extrusionHeights({ floorFt: 18_000, floorRef: "STD", ceilingFt: null, ceilingRef: null }, 0)).toBeNull();
  });

  it("clamps an MSL floor below the ground to the ground", () => {
    const h = extrusionHeights({ floorFt: 500, floorRef: "MSL", ceilingFt: 4_000, ceilingRef: "MSL" }, 300)!;
    expect(h.base).toBe(0);
  });
});

describe("vertexCentroids", () => {
  it("takes the mean of the vertices, the closing one left out, holes in", () => {
    const square = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    expect(vertexCentroids({ type: "Polygon", coordinates: [square] })).toEqual([[2, 2]]);
    const hole = [
      [1, 1],
      [1, 2],
      [2, 2],
      [2, 1],
      [1, 1],
    ];
    // (0+4+4+0+1+1+2+2) / 8 = 1.75 each way.
    expect(vertexCentroids({ type: "Polygon", coordinates: [square, hole] })).toEqual([[1.75, 1.75]]);
  });

  it("gives one a polygon of a multipolygon, and none for a point", () => {
    const tri = (x: number) => [
      [x, 0],
      [x + 3, 0],
      [x, 3],
      [x, 0],
    ];
    expect(vertexCentroids({ type: "MultiPolygon", coordinates: [[tri(0)], [tri(10)]] })).toEqual([
      [1, 1],
      [11, 1],
    ]);
    expect(vertexCentroids({ type: "Point" })).toEqual([]);
  });
});

describe("meanGround", () => {
  it("averages the ground at the centroids it has, null with none", () => {
    expect(
      meanGround(
        [
          [0, 0],
          [1, 1],
        ],
        ([x]) => (x === 0 ? 100 : 200),
      ),
    ).toBe(150);
    expect(meanGround([[0, 0]], () => null)).toBeNull();
  });
});

describe("heightsOf", () => {
  it("reads a NASR volume's ceiling as MSL and a special use area's by its own reference", () => {
    expect(heightsOf("airspace", { class: "B", floor_ft: 3000, floor_ref: "MSL", ceiling_ft: 10000 })).toEqual({
      floorFt: 3000,
      floorRef: "MSL",
      ceilingFt: 10000,
      ceilingRef: "MSL",
    });
    // Unlimited: no ceiling figure.
    expect(heightsOf("special_use", { floor_ft: 500, floor_ref: "SFC", ceiling_ref: "OTHER" })).toEqual({
      floorFt: 500,
      floorRef: "SFC",
      ceilingFt: null,
      ceilingRef: "OTHER",
    });
  });

  it("draws Class B, C, D and surface Class E only", () => {
    expect(DRAWN.airspace({ class: "B" })).toBe(true);
    expect(DRAWN.airspace({ class: "E", local_type: "CLASS_E2" })).toBe(true);
    expect(DRAWN.airspace({ class: "E", local_type: "CLASS_E5" })).toBe(false);
    expect(DRAWN.airspace({ class: "A" })).toBe(false);
  });
});

describe("surface Class E", () => {
  it("is drawn only from the surface", () => {
    expect(DRAWN.airspace({ class: "E", local_type: "CLASS_E4", floor_ft: 0 })).toBe(true);
    expect(DRAWN.airspace({ class: "E", local_type: "CLASS_E4", floor_ft: 700, floor_ref: "AGL" })).toBe(false);
  });
});
