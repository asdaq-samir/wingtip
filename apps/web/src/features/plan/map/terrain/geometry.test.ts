import { describe, expect, it } from "vitest";
import { aloftPath, curtainWalls, obstacleFeatures } from "./geometry";

const C81 = { lat: 42.3246, lon: -88.0974, altFt: 869 };
const CRUISE = { lat: 42.6, lon: -88.6, altFt: 4500 };
const KMSN = { lat: 43.1399, lon: -89.3375, altFt: 4500 };

describe("the route aloft", () => {
  it("is the plan's points at their altitudes, metres above the sea", () => {
    // 4,500 ft is 1,371.6 m (0.3048 m a foot); 869 ft, 264.9 m.
    expect(aloftPath([C81, CRUISE])).toEqual([
      [C81.lon, C81.lat, expect.closeTo(264.87, 2)],
      [CRUISE.lon, CRUISE.lat, expect.closeTo(1371.6, 1)],
    ]);
  });

  it("hangs one upright wall a leg, from the sea to the line", () => {
    const walls = curtainWalls([C81, CRUISE, CRUISE, KMSN]);
    // The point repeated makes no wall.
    expect(walls).toHaveLength(2);
    const [foot, , top, start] = walls[0]!;
    expect(foot).toEqual([C81.lon, C81.lat, 0]);
    expect(top).toEqual([CRUISE.lon, CRUISE.lat, expect.closeTo(1371.6, 1)]);
    expect(start![2]).toBeCloseTo(264.87, 2);
    // Closed, as a polygon's ring is.
    expect(walls[0]!.at(-1)).toEqual(foot);
  });
});

describe("the obstacles", () => {
  it("stand as tall above their ground as the obstacle file says", () => {
    const [post] = obstacleFeatures([{ lat: 42.1, lon: -88.2, agl_ft: 1000, amsl_ft: 1900, type: "TOWER", lit: true }], 60).features;
    expect(post!.properties).toMatchObject({ height: 304.8, agl: 1000, type: "TOWER" });
  });
});
