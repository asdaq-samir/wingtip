import { describe, expect, it } from "vitest";
import { DEFAULT_CHART_DIM } from "../map/chartLook";
import { migratePreferences } from "./migrate";

describe("the preferences kept before the Dimmer (version 11)", () => {
  it("make Dark + Bright, the chart as printed under the dark page, a dark Dimmer of 0", () => {
    const kept = migratePreferences({ base: "sec", chartNight: "normal" }, 11, "dark");
    expect(kept).toEqual({ base: "sec", chartDim: { light: 0, dark: 0 } });
  });

  it("leave the defaults, the chart dimmed at night, for every other pilot, and drop chartNight", () => {
    expect(migratePreferences({ base: "sec", chartNight: "dimmed" }, 11, "dark")).toEqual({ base: "sec" });
    expect(migratePreferences({ chartNight: "normal" }, 11, "light")).toEqual({});
    expect(migratePreferences({ chartNight: "normal" }, 11, null)).toEqual({});
    expect(DEFAULT_CHART_DIM.dark).toBeGreaterThan(0);
  });

  it("read a store already at the Dimmer's version as it is", () => {
    const kept = { chartDim: { light: 0.2, dark: 0.6 }, chartContrast: 0.1 };
    expect(migratePreferences(kept, 12, "dark")).toBe(kept);
  });
});
