import { describe, expect, test } from "vitest";
import fixture from "../../lib/fixtures/platePagePoint.json";
import type { Fix } from "../../lib/map/position/ownShip";
import { pageMarkOf } from "./platePosition";

const fix = (lat: number, lon: number, headingDeg: number | null, speedKt: number | null = null): Fix => ({
  lat,
  lon,
  accuracyM: 5,
  headingDeg,
  speedKt,
  altitudeFt: null,
  at: 0,
});

describe("own ship on a plate's page, the engine's (platePagePoint.json, KRFD ILS RWY 07)", () => {
  test.each(fixture.cases)("$why", (c) => {
    const mark = pageMarkOf(fix(c.input.lat, c.input.lon, c.input.track_deg), fixture.georeference);
    if (c.expected === null) {
      expect(mark).toBeNull();
      return;
    }
    expect(mark!.x).toBeCloseTo(c.expected.x, 4);
    expect(mark!.y).toBeCloseTo(c.expected.y, 4);
    if (c.expected.rotation_deg === null) expect(mark!.rotationDeg).toBeNull();
    else expect(mark!.rotationDeg!).toBeCloseTo(c.expected.rotation_deg, 2);
  });

  test("no fix or no georeference, no mark", () => {
    expect(pageMarkOf(null, fixture.georeference)).toBeNull();
    expect(pageMarkOf(fix(42.2, -89.1, 90), null)).toBeNull();
  });

  test("under way, the airplane's beam, as on the map", () => {
    expect(pageMarkOf(fix(42.2, -89.1, 90, 90), fixture.georeference)!.moving).toBe(true);
    expect(pageMarkOf(fix(42.2, -89.1, null, 0), fixture.georeference)!.moving).toBe(false);
  });
});
