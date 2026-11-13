import { describe, expect, it } from "vitest";
import { drawerEasing } from "./drawerEasing";

// The map's eases on the Drawer's curve, cubic-bezier(0.32, 0.72, 0, 1)
// (the wiring audit's item 9), so the map and the sheet move together.
describe("the Drawer's curve for the map", () => {
  it("starts and ends where a CSS cubic-bezier does, and rises all the way", () => {
    expect(drawerEasing(0)).toBe(0);
    expect(drawerEasing(1)).toBe(1);
    // Half the time in, the curve is 95% of the way: the solved value.
    expect(drawerEasing(0.5)).toBeCloseTo(0.9548, 3);
    let was = 0;
    for (let t = 0.05; t < 1; t += 0.05) {
      const y = drawerEasing(t);
      expect(y).toBeGreaterThanOrEqual(was);
      was = y;
    }
  });
});
