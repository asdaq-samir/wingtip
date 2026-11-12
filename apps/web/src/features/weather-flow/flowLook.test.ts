import { describe, expect, it } from "vitest";
import { FIELDS, lookOf, rampGradient, tickPlace } from "./flowLook";

describe("the flow layer's legends", () => {
  it("lists every field once, wind first, for the Map menu and the legend's menu", () => {
    expect(FIELDS.map((f) => f.value)).toEqual(["wind", "gust", "precip", "cloud", "temp", "vis"]);
  });

  it("puts the highest value at the top of the bar and the lowest at its foot", () => {
    const ramp = lookOf("wind").ramp;
    expect(tickPlace(ramp, 75)).toBe(0);
    expect(tickPlace(ramp, 0)).toBe(1);
    expect(tickPlace(ramp, 200)).toBe(0);
  });

  it("says precipitation in the radar's intensity words, light at the foot and extreme at the top", () => {
    const look = lookOf("precip");
    expect(look.ticks.map((t) => t.label)).toEqual(["Light", "Moderate", "Heavy", "Extreme"]);
    const places = look.ticks.map((t) => tickPlace(look.ramp, t.at));
    expect([...places].sort((a, b) => b - a)).toEqual(places);
  });

  it("draws the bar as a gradient from the ramp's own colours", () => {
    expect(rampGradient(lookOf("temp").ramp)).toMatch(/^linear-gradient\(to bottom, color-mix\(/);
  });
});
