import { describe, expect, it } from "vitest";
import { weatherLineOf } from "./weatherLine";

describe("weatherLineOf", () => {
  it("writes the ceiling, the true wind and the report's time, UTC", () => {
    expect(
      weatherLineOf({
        ceiling_ft: 1800,
        ceiling_unknown: false,
        wind_dir_true_deg: 310,
        wind_speed_kt: 4,
        observed_at: "2026-11-14T12:55:00Z",
      }),
    ).toBe("Ceiling 1,800 ft · 310°T 4 kt · 1255Z");
  });

  it("says no ceiling where the report has none, and calm", () => {
    expect(
      weatherLineOf({
        ceiling_ft: null,
        ceiling_unknown: false,
        wind_dir_true_deg: 0,
        wind_speed_kt: 0,
        observed_at: "2026-11-14T09:05:00Z",
      }),
    ).toBe("No ceiling · Calm · 0905Z");
  });

  it("leaves out what the report could not say, never a guessed figure", () => {
    expect(weatherLineOf({ ceiling_ft: null, ceiling_unknown: true, wind_speed_kt: null, observed_at: null })).toBe("");
    expect(weatherLineOf({ ceiling_ft: 900, ceiling_unknown: false, wind_speed_kt: 12, wind_gust_kt: 20, wind_dir_true_deg: null })).toBe(
      "Ceiling 900 ft · VRB 12G20 kt",
    );
  });
});
