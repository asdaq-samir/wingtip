import { describe, expect, it } from "vitest";
import type { ForecastRun } from "../../../lib/api/types";
import { NO_MINIMUMS } from "../../../lib/minimums";
import type { DryRun } from "../components/navlog/dryRun";
import type { RouteEnds } from "../components/navlog/rows";
import { alertsBy, areasAt, forecastAsk, hourZ, sampleAt, unavailableWords, zulu } from "./forecastRun";

const T0 = Date.UTC(2026, 10, 9, 14, 0) / 1000;

/** A run of `n` points a minute apart, its middle row reached half way. */
function run(n: number): DryRun {
  const points = Array.from({ length: n }, (_, i) => ({
    t: T0 + i * 60,
    lat: 45,
    lon: -93 + i * 0.01,
    alt_ft: 3500,
    gs_kt: 100,
    track_deg: 90,
  }));
  return {
    points,
    alongNm: points.map((_, i) => i),
    fuelGal: points.map(() => 0),
    rowT: [T0, T0 + (n / 2) * 60, T0 + (n - 1) * 60],
    bends: [],
    landings: [{ ident: "KBBB", t: T0 + (n - 1) * 60, nm: n, fuel: 0 }],
  } as unknown as DryRun;
}

const ENDS = {
  departure: { ident: "KAAA", lat: 45, lon: -93 },
  destination: { ident: "KBBB", lat: 45, lon: -92 },
  stops: [],
} as unknown as RouteEnds;

describe("forecastAsk", () => {
  it("thins the run to 400 points, the last kept, each with the row it flies to", () => {
    const ask = forecastAsk(run(1001), ENDS, "vfr", { ...NO_MINIMUMS, ceilingFt: 2000 });
    expect(ask.track.length).toBeLessThanOrEqual(401);
    expect(ask.track.at(-1)!.t).toBe(T0 + 1000 * 60);
    expect(ask.track[0]!.row).toBe(0);
    expect(ask.track[1]!.row).toBe(1);
    expect(ask.track.at(-1)!.row).toBe(2);
    expect(ask.rules).toBe("VFR");
    expect(ask.minimums).toEqual({ ceiling_ft: 2000, visibility_sm: null });
  });

  it("names the departure at the run's start and the destination when it is in", () => {
    const ask = forecastAsk(run(11), ENDS, "ifr", NO_MINIMUMS);
    expect(ask.fields).toEqual([
      { ident: "KAAA", role: "departure", t: T0, lat: 45, lon: -93 },
      { ident: "KBBB", role: "destination", t: T0 + 600, lat: 45, lon: -92 },
    ]);
    expect(ask.rules).toBe("IFR");
  });
});

const ANSWER = {
  samples: [
    { t: T0, lat: 45, lon: -93, category: "VFR", areas: [] },
    { t: T0 + 600, lat: 45, lon: -92.9, category: "IFR", areas: [0] },
  ],
  alerts: [
    { t: T0 + 600, kind: "sigmet", words: "At 1410Z the airplane enters: SIGMET for icing", source: "AWC SIGMET" },
    { t: T0 + 900, kind: "vfr_minimums", words: "under", source: "14 CFR 91.155" },
  ],
  areas: [{ kind: "sigmet", valid_from: T0 + 300, valid_to: T0 + 3600, coords: [] }],
  legs: [],
  fields: [],
  unavailable: [],
} as unknown as ForecastRun;

describe("the run as it plays", () => {
  it("reads the point last passed, the alerts reached, the areas in force", () => {
    expect(sampleAt(ANSWER, T0 + 300)!.category).toBe("VFR");
    expect(sampleAt(ANSWER, T0 + 700)!.category).toBe("IFR");
    expect(alertsBy(ANSWER, T0 + 599)).toEqual([]);
    expect(alertsBy(ANSWER, T0 + 1000).map((a) => a.kind)).toEqual(["vfr_minimums", "sigmet"]);
    expect(areasAt(ANSWER, T0)).toEqual([]);
    expect(areasAt(ANSWER, T0 + 300)).toHaveLength(1);
    expect(areasAt(ANSWER, T0 + 3600)).toEqual([]);
  });

  it("writes times in Zulu and the products missing in words", () => {
    expect(hourZ(T0 + 1200)).toBe("14Z");
    expect(zulu(T0 + 1200)).toBe("1420Z");
    expect(unavailableWords([])).toBeNull();
    expect(unavailableWords(["tafs", "winds"])).toBe("Played without TAFs, the winds aloft.");
  });
});
