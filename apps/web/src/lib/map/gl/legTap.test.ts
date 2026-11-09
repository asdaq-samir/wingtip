import { describe, expect, test } from "vitest";
import { LEG_RANK, LEG_REACH, nearestLeg, type GlLeg } from "./legTap";
import { TAP } from "./layers/common";

// A flat projection for the test: a degree a hundred pixels, north up.
const project = (p: { lat: number; lon: number }) => ({ x: p.lon * 100, y: -p.lat * 100 });

describe("nearestLeg", () => {
  // An L: west to east, then north.
  const legs: GlLeg[] = [
    { key: "a", from: { lat: 0, lon: 0 }, to: { lat: 0, lon: 1 } },
    { key: "b", from: { lat: 0, lon: 1 }, to: { lat: 1, lon: 1 } },
  ];

  test("a tap beside a leg picks that leg", () => {
    expect(nearestLeg(legs, { x: 40, y: 15 }, project)?.key).toBe("a");
    expect(nearestLeg(legs, { x: 115, y: -60 }, project)?.key).toBe("b");
  });

  test("past a leg's end, the nearer end's leg", () => {
    expect(nearestLeg(legs, { x: -30, y: 0 }, project)?.key).toBe("a");
    expect(nearestLeg(legs, { x: 100, y: -130 }, project)?.key).toBe("b");
  });

  test("no legs, none", () => {
    expect(nearestLeg([], { x: 0, y: 0 }, project)).toBeNull();
  });

  test("a finger's half width either side, after every mark and before the airspace's lines", () => {
    expect(LEG_REACH).toBeGreaterThanOrEqual(22);
    expect(LEG_RANK).toBeGreaterThan(TAP.rank.mark + 1);
    expect(LEG_RANK).toBeLessThan(TAP.rank.line);
  });
});
