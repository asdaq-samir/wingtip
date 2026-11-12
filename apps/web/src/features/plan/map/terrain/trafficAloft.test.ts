import { describe, expect, test } from "vitest";
import { inFrame, standAtM, toScreen, worldPoint, worldPxAt } from "./trafficAloft";

describe("traffic stood at its height", () => {
  test("an airplane stands at its reported height, never under the ground", () => {
    // 4,500 ft is 1,371.6 m (0.3048 m a foot).
    expect(standAtM(4500, 300)).toBeCloseTo(1371.6, 6);
    // A height under the ground (an uncorrected pressure altitude on a
    // high-pressure day, a geometric height on the runway) stands on it.
    expect(standAtM(500, 300)).toBe(300);
    expect(standAtM(null, 300)).toBe(300);
  });

  test("a point is placed through the frame's matrix, column-major, and none behind the camera", () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(toScreen(identity, { x: 0, y: 0, z: 0 }, 400, 800)).toEqual({ x: 200, y: 400 });
    expect(toScreen(identity, { x: 1, y: 1, z: 0 }, 400, 800)).toEqual({ x: 400, y: 0 });
    const behind = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1];
    expect(toScreen(behind, { x: 0, y: 0, z: 0 }, 400, 800)).toBeNull();
    expect(inFrame({ x: -50, y: 10 }, 400, 800)).toBe(false);
    expect(inFrame({ x: -30, y: 10 }, 400, 800)).toBe(true);
  });

  test("the matrix takes world pixels across and metres up", () => {
    // MapLibre's world is a 512-pixel tile at zoom 0, doubled each level.
    expect(worldPxAt(0)).toBe(512);
    expect(worldPxAt(10)).toBe(524288);
    expect(worldPoint({ x: 0.25, y: 0.5 }, 1024, 300)).toEqual({ x: 256, y: 512, z: 300 });
  });
});
