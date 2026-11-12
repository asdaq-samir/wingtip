import { describe, expect, it } from "vitest";
import { blendView, ease, keyedView, type Keyframe, type View } from "./keyframes";

const v = (lon: number, bearing: number): View => ({ lon, lat: 45, zoom: 12, bearing, pitch: 60 });
const key = (id: string, t: number, view: View): Keyframe => ({ id, t, kind: "fixed", fixed: view });

describe("camera keyframes", () => {
  it("eases in and out: at rest at both ends, halfway at the middle", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(0.1)).toBeLessThan(0.1);
  });

  it("turns the short way round through north", () => {
    expect(blendView(v(0, 350), v(0, 10), 0.5).bearing).toBeCloseTo(0, 6);
    expect(blendView(v(0, 10), v(0, 350), 0.25).bearing).toBeCloseTo(5, 6);
  });

  it("holds the first before it and the last after it, and eases between", () => {
    const keys = [key("b", 200, v(10, 0)), key("a", 100, v(0, 0))];
    const view = (t: number) => keyedView(keys, t, (k) => k.fixed)!;
    expect(view(50).lon).toBe(0);
    expect(view(300).lon).toBe(10);
    expect(view(150).lon).toBeCloseTo(5, 6);
    expect(view(110).lon).toBeLessThan(1);
  });

  it("holds the other's view where one has nothing to follow", () => {
    const keys = [key("a", 100, v(0, 0)), key("b", 200, v(10, 0))];
    expect(keyedView(keys, 150, (k) => (k.id === "a" ? null : k.fixed))?.lon).toBe(10);
    expect(keyedView([], 150, (k) => k.fixed)).toBeNull();
  });
});
