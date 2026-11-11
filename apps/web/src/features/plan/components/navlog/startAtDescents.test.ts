import { describe, expect, it } from "vitest";
import fixture from "../../../../lib/fixtures/startAtDescents.json";
import { callEngine } from "../../../../lib/engine/engine";

// The shared Start At descents the engine's own test reads
// (engine/facade/tests/start_at_descents.rs), through the WebAssembly the
// nav log's rows and profile are drawn from: a Start At descent begins at
// the waypoint, a Cross At one is done by it.
const fixes = [
  { name: "AAA", category: "departure", lat: 40.0, lon: -90.0 },
  { name: "Lake", category: "lake", lat: 40.7, lon: -89.1 },
  { name: "BBB", category: "destination", lat: 41.4, lon: -88.2 },
];

const leg = ([distance, altitude, startAt]: (number | boolean)[]) => ({
  distance_nm: distance as number,
  altitude_ft: altitude as number,
  groundspeed_kt: 100,
  ete_min: ((distance as number) / 100) * 60,
  fuel_gal: ((distance as number) / 100) * 8,
  wind: null,
  tas_kt: 100,
  fuel_burn_gph: 8,
  oat_c: null,
  true_course_deg: 45,
  climb_min: 0,
  toc: null,
  start_at: startAt as boolean,
});

describe("a pilot's Start At descent in the nav log", () => {
  it.each(fixture.cases)("$name", (c) => {
    const legs = callEngine("navlog_with_descents", { legs: c.legs.map(leg), fixes, end_altitude_ft: c.end_altitude_ft });
    c.tods.forEach((want, i) => {
      const tod = legs[i]!.tod;
      if (want === null) {
        expect(tod ?? null).toBeNull();
        return;
      }
      expect(tod).toMatchObject({ ...want, ete_min: expect.closeTo(want.ete_min, 9) });
    });
  });
});
