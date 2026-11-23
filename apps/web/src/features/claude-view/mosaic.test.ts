import { describe, expect, it } from "vitest";
import fixture from "../../lib/fixtures/flightView.json";
import type { Answer } from "./flightView";
import { mosaicOf } from "./mosaic";

const view = (fixture as unknown as Answer).view;

describe("the chart's still picture of the route", () => {
  it("frames every point inside the box, at a zoom of the sectional's", () => {
    const m = mosaicOf(view, 360, 224);
    expect(m.zoom).toBeGreaterThanOrEqual(5);
    expect(m.zoom).toBeLessThanOrEqual(11);
    for (const p of m.points) {
      expect(p.left).toBeGreaterThan(0);
      expect(p.left).toBeLessThan(360);
      expect(p.top).toBeGreaterThan(0);
      expect(p.top).toBeLessThan(224);
    }
  });

  it("lays tiles over the whole box and draws the course as a line", () => {
    const m = mosaicOf(view, 360, 224);
    expect(Math.min(...m.tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.max(...m.tiles.map((t) => t.left + 256))).toBeGreaterThanOrEqual(360);
    expect(m.line.split(" ").length).toBe(view.line.length);
  });

  it("zooms in for a wider box", () => {
    expect(mosaicOf(view, 1200, 900).zoom).toBeGreaterThan(mosaicOf(view, 240, 160).zoom);
  });
});
