import { describe, expect, it } from "vitest";
import { sourceLine } from "./flowSource";
import type { FlowFrame } from "./useWeatherFlow";

const frame = (source: Record<string, unknown>) => ({ sources: { "wind-060": source } }) as unknown as FlowFrame;

describe("the legend's source line", () => {
  it("names AWC's product and its cycle's hour", () => {
    const line = sourceLine(
      frame({ label: "AWC winds", issued: "2026-11-12T12:00:00Z", stale: false, fallback: false }),
      "wind-060",
      false,
      false,
    );
    expect(line).toEqual({ text: "AWC winds, 12Z", stale: false });
  });

  it("says when NOAA's model stands in for AWC's, and an old copy is stale", () => {
    const line = sourceLine(
      frame({ label: "NOAA GFS", issued: "2026-11-12T06:00:00Z", stale: true, fallback: true }),
      "wind-060",
      false,
      false,
    );
    expect(line).toEqual({ text: "NOAA GFS in place of AWC, 06Z", stale: true });
  });

  it("says the radar's for an hour past, and the world wind's beyond the box zoomed out", () => {
    expect(sourceLine(null, "precip", true, false).text).toBe("Radar, observed");
    const line = sourceLine(
      frame({ label: "AWC winds", issued: "2026-11-12T12:00:00Z", stale: false, fallback: false }),
      "wind-060",
      false,
      true,
    );
    expect(line.text).toBe("AWC winds, 12Z; NOAA GFS beyond");
  });
});
