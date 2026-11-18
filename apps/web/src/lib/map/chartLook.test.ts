import { describe, expect, it } from "vitest";
import { chartPaint } from "./gl/glStyle";
import { CONTRAST_MAX, CONTRAST_MIN, DEFAULT_CHART_DIM, DIM_MAX, NIGHT_DIM, chartBrightness, chartContrast } from "./chartLook";

describe("the chart's Dimmer and Contrast", () => {
  it("dims the dark theme to half and the light theme not at all by default, as before the Dimmer", () => {
    expect(DEFAULT_CHART_DIM).toEqual({ light: 0, dark: NIGHT_DIM });
    expect(chartPaint(true, false)).toMatchObject({ "raster-brightness-max": 0.5, "raster-contrast": 0.13, "raster-saturation": 0 });
    expect(chartPaint(false, false)).toMatchObject({ "raster-brightness-max": 1, "raster-contrast": 0.1, "raster-saturation": 0.1 });
  });

  it("draws the Dimmer as 1 less the dim, no deeper than DIM_MAX", () => {
    expect(chartPaint(true, false, 0)?.["raster-brightness-max"]).toBe(1);
    expect(chartPaint(false, false, 0.25)?.["raster-brightness-max"]).toBe(0.75);
    expect(chartBrightness(DIM_MAX, false)).toBe(0.3);
    expect(chartBrightness(5, false)).toBe(0.3);
    expect(chartBrightness(-1, false)).toBe(1);
  });

  it("draws sunlight at full brightness whatever the Dimmer, its contrast still offset", () => {
    expect(chartPaint(true, true, 0.6, 0.1)).toMatchObject({
      "raster-brightness-max": 1,
      "raster-contrast": 0.3,
      "raster-saturation": 0.2,
    });
  });

  it("adds Contrast to the look's own, by day, at night and in sunlight, leaving the saturation", () => {
    expect(chartPaint(false, false, 0, 0.2)).toMatchObject({ "raster-contrast": 0.3, "raster-saturation": 0.1 });
    expect(chartPaint(true, false, NIGHT_DIM, 0.1)).toMatchObject({ "raster-contrast": 0.23, "raster-saturation": 0 });
    expect(chartPaint(false, false, 0, -0.3)?.["raster-contrast"]).toBe(-0.2);
  });

  it("keeps the offset in its range and the contrast inside MapLibre's -1 to 1", () => {
    expect(chartContrast(0.1, 2)).toBe(0.1 + CONTRAST_MAX);
    expect(chartContrast(0.1, -2)).toBe(Math.round((0.1 + CONTRAST_MIN) * 100) / 100);
    expect(chartContrast(0.9, CONTRAST_MAX)).toBe(1);
    expect(chartContrast(-0.9, CONTRAST_MIN)).toBe(-1);
  });
});
