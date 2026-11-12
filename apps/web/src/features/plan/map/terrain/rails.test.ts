import { describe, expect, it } from "vitest";
import { bandRing, edgeRuns, metresPerPixel, railFeatures } from "./rails";

const FT = 0.3048;

describe("edgeRuns", () => {
  it("keeps a ring with no tile cut whole", () => {
    const ring = [
      [0, 0],
      [1, 0.5],
      [0.5, 1.2],
      [0, 0],
    ];
    expect(edgeRuns(ring)).toEqual([ring]);
  });

  it("keeps a curve's straight steps inside its bounds", () => {
    const ring = [
      [0, 0],
      [0.5, 0],
      [0.5, 0.3],
      [1, 0.6],
      [0, 0.9],
      [0, 0],
    ];
    // The last edge is at the bounds' west: taken for a cut.
    expect(edgeRuns(ring)).toEqual([ring.slice(0, 5)]);
  });

  it("leaves out a tile's cut along a meridian or a parallel", () => {
    // A circle's piece cut by the tile's east edge at lon 1.
    const ring = [
      [0, 0],
      [1, 0.2],
      [1, 0.8],
      [0.2, 1.1],
      [0, 0],
    ];
    expect(edgeRuns(ring)).toEqual([
      [
        [0, 0],
        [1, 0.2],
      ],
      [
        [1, 0.8],
        [0.2, 1.1],
        [0, 0],
      ],
    ]);
  });
});

describe("bandRing", () => {
  it("is a closed band the width asked round the line", () => {
    const ring = bandRing(
      [
        [0, 0],
        [0.01, 0],
      ],
      100,
    );
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    // 50 m either side of the equator: 50 / 111,120 m a degree.
    expect(ring[0]![1]).toBeCloseTo(50 / 111_120, 9);
    expect(ring[2]![1]).toBeCloseTo(-50 / 111_120, 9);
  });
});

describe("railFeatures", () => {
  const ring = [
    [0, 0],
    [0.1, 0.02],
    [0.05, 0.1],
    [0, 0],
  ];
  it("puts a rail under an MSL ceiling at its true altitude, and one at an MSL floor", () => {
    const out = railFeatures(
      [{ rings: [ring], heights: { floorFt: 3000, floorRef: "MSL", ceilingFt: 10000, ceilingRef: "MSL" }, ink: "x" }],
      50,
      () => 200,
    );
    const [top, floor] = out.features.map((f) => f.properties as { base: number; height: number; ink: string });
    expect(top!.height + 200).toBeCloseTo(10000 * FT, 6);
    expect(top!.height - top!.base).toBeCloseTo(50, 6);
    expect(floor!.base + 200).toBeCloseTo(3000 * FT, 6);
    expect(top!.ink).toBe("x");
  });

  it("gives a surface floor no rail: the chart's line is its edge", () => {
    const out = railFeatures(
      [{ rings: [ring], heights: { floorFt: 0, floorRef: "SFC", ceilingFt: 2500, ceilingRef: "MSL" }, ink: "x" }],
      50,
      () => 200,
    );
    expect(out.features).toHaveLength(1);
  });
});

describe("metresPerPixel", () => {
  it("is Web Mercator's at a 512 px tile", () => {
    expect(metresPerPixel(0, 0)).toBeCloseTo(78_271.517, 2);
    expect(metresPerPixel(60, 1)).toBeCloseTo(78_271.517 / 4, 2);
  });
});
