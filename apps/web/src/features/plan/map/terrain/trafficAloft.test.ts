import { describe, expect, test } from "vitest";
import { standAtM } from "./trafficAloft";

describe("traffic stood at its height", () => {
  test("an airplane stands at its reported height, never under the ground", () => {
    // 4,500 ft is 1,371.6 m (0.3048 m a foot).
    expect(standAtM(4500, 300)).toBeCloseTo(1371.6, 6);
    // A height under the ground (an uncorrected pressure altitude on a
    // high-pressure day, a geometric height on the runway) stands on it.
    expect(standAtM(500, 300)).toBe(300);
    expect(standAtM(null, 300)).toBe(300);
  });
});
