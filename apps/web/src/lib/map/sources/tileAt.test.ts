import { describe, expect, it } from "vitest";
import { tileAt } from "./tiles";

describe("tileAt", () => {
  it("finds the Web Mercator tile a point is in, and where in it", () => {
    // 0,0 is the corner of four tiles at zoom 1: the south-east one, at its top left.
    expect(tileAt(0, 0, 1)).toEqual({ x: 1, y: 1, fx: 0, fy: 0 });
    // KDLH (46.842 N, 92.194 W) at zoom 10: tile 249/360 of the OSM grid.
    const t = tileAt(46.842, -92.194, 10);
    expect([t.x, t.y]).toEqual([249, 360]);
    expect(t.fx).toBeGreaterThanOrEqual(0);
    expect(t.fx).toBeLessThan(1);
  });
});
