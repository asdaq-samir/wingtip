import { describe, expect, test } from "vitest";
import type { WeatherArea } from "../../lib/api/types";
import { mapLevel } from "../../lib/format";
import { areaLabel, areaWords, inside, pirepMark, routeThrough } from "./weatherMap";
import { callEngine } from "../../lib/engine/engine";
import { hazardTextInk } from "../../lib/map/weatherColours";
import { WEATHER } from "../../lib/tokens";
import { geoLoaded } from "../../lib/geo";

// The engine's geodesic rules, loaded by the setup file (vitestSetup).
const geo = await geoLoaded;

const square = [
  [42, -90],
  [44, -90],
  [44, -87],
  [42, -87],
];
const icing = {
  id: "g",
  kind: "gairmet",
  hazard: "Icing",
  severity: "MOD",
  low_ft: null,
  high_ft: 16000,
  from_freezing_level: true,
  coords: square,
} as WeatherArea;
const turb = {
  id: "s",
  kind: "sigmet",
  hazard: "TURB",
  low_ft: 8000,
  high_ft: 20000,
  from_freezing_level: false,
  coords: square,
} as WeatherArea;

describe("the weather drawn on the map", () => {
  test("writes altitudes as FL and hundreds of feet, the owner's pick (kept 2026-11-06)", () => {
    expect(mapLevel(4500)).toBe("FL045");
    expect(mapLevel(18000)).toBe("FL180");
    expect(areaWords(icing)).toEqual({ title: "G-AIRMET · Icing", altitudes: "Freezing level to FL160" });
    expect(areaWords(turb)).toEqual({ title: "SIGMET · Turbulence", altitudes: "FL080 to FL200" });
  });

  test("says how far the route is in an area, and whether the plan is under, in or over it", () => {
    expect(inside({ lat: 43, lon: -88 }, square)).toBe(true);
    expect(inside({ lat: 45, lon: -88 }, square)).toBe(false);
    // West to east along 43°N, through the square's three degrees of
    // longitude: about 132 nm at that latitude.
    const line: [number, number][] = [
      [43, -92],
      [43, -85],
    ];
    const through = routeThrough(geo, turb, line, 4500)!;
    expect(through.nm).toBeGreaterThan(125);
    expect(through.nm).toBeLessThan(140);
    expect(through.relation).toBe("below");
    expect(routeThrough(geo, turb, line, 9500)!.relation).toBe("in");
    // From the freezing level: no altitude to say it against.
    expect(routeThrough(geo, icing, line, 4500)!.relation).toBeNull();
    expect(
      routeThrough(
        geo,
        turb,
        [
          [45, -92],
          [45, -85],
        ],
        4500,
      ),
    ).toBeNull();
  });

  test("marks a PIREP by the worst it met, its altitude in hundreds", () => {
    expect(pirepMark({ lat: 0, lon: 0, altitude_ft: 6500, turbulence: "MOD", urgent: false })).toMatchObject({
      glyph: "⌁\uFE0E",
      level: "065",
    });
    expect(pirepMark({ lat: 0, lon: 0, altitude_ft: 4500, icing: "LGT", urgent: false })).toMatchObject({ glyph: "❄\uFE0E", level: "045" });
    expect(pirepMark({ lat: 0, lon: 0, altitude_ft: 3000, urgent: true })).toMatchObject({ glyph: "!" });
  });

  test("labels each area along its outline with its hazard and its top", () => {
    const short = callEngine("gairmet_hazards", {}).labels;
    // A G-AIRMET in AWC's own short words (the flow layer's), a SIGMET by
    // its kind and the engine's word for its code.
    expect(areaLabel(icing, short)).toBe("Ice to FL160");
    expect(areaLabel(turb, short)).toBe("SIGMET Turbulence to FL200");
    expect(areaLabel({ ...turb, kind: "convective", hazard: null, high_ft: null }, short)).toBe("Convective SIGMET");
  });

  test("writes turbulence's words in a deeper amber, legible on the map's white", () => {
    expect(hazardTextInk(WEATHER.turbulence)).toBe(WEATHER.turbulenceText);
    expect(hazardTextInk(WEATHER.icing)).toBe(WEATHER.icing);
  });
});
