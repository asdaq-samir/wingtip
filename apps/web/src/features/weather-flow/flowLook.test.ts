import { describe, expect, it } from "vitest";
import { FIELDS, hasStreaks, lookOf, rampGradient, tickPlace } from "./flowLook";

describe("the flow layer's legends", () => {
  it("lists every field once, in the owner's order, for the Map menu and the legend's menu", () => {
    expect(FIELDS.map((f) => f.label)).toEqual([
      "Wind",
      "Gusts",
      "Precipitation",
      "Clouds",
      "Ceiling",
      "Thunderstorm energy",
      "Temperature",
      "Visibility",
    ]);
  });

  it("streaks the wind and the gusts only", () => {
    expect(FIELDS.filter((f) => hasStreaks(f.value)).map((f) => f.value)).toEqual(["wind", "gust"]);
  });

  it("puts the highest value at the top of the bar and the lowest at its foot", () => {
    const ramp = lookOf("wind").bar;
    expect(tickPlace(ramp, 75)).toBe(0);
    expect(tickPlace(ramp, 0)).toBe(1);
    expect(tickPlace(ramp, 200)).toBe(0);
  });

  it("says precipitation in the AIM's intensity words, light at the foot and extreme at the top", () => {
    const look = lookOf("precip");
    expect(look.ticks.map((t) => t.label)).toEqual(["Light", "Moderate", "Heavy", "Extreme"]);
    const places = look.ticks.map((t) => tickPlace(look.bar, t.at));
    expect([...places].sort((a, b) => b - a)).toEqual(places);
    // The ramp turns moderate at AIM 7-1-12's 26 dBZ, the engine's band.
    expect(look.ramp.map(([at]) => at)).toContain(26);
  });

  it("bands the ceiling by AIM 7-1-7's categories and CAPE by the NWS's, one block each", () => {
    expect(lookOf("ceiling").ticks.map((t) => t.label)).toEqual(["LIFR", "IFR 500", "MVFR 1,000", "VFR 3,000"]);
    expect(lookOf("cape").ticks.map((t) => t.label)).toEqual(["Weak", "Moderate 1,000", "Strong 2,500", "Extreme 4,000"]);
    const ceiling = lookOf("ceiling").ramp.map(([at]) => at);
    expect(ceiling).toEqual(expect.arrayContaining([0, 500, 1000, 3000]));
  });

  it("draws the bar as a gradient from the ramp's own colours", () => {
    expect(rampGradient(lookOf("temp").bar)).toMatch(/^linear-gradient\(to bottom, color-mix\(/);
  });
});
