import { describe, expect, test } from "vitest";
import type { Runway } from "./api/types";
import { geoLoaded } from "./geo";
import { departurePattern, patternsOf, patternsParam, trafficPattern } from "./trafficPattern";

// The engine's geodesic rules, loaded by the setup file (vitestSetup).
const { bearingDeg } = await geoLoaded;

// A runway 09/27 a mile long on the equator: 09 lands east, 27 west.
const RUNWAY = {
  ends: "09/27",
  length_ft: 6076,
  width_ft: 100,
  surface: "ASP",
  lighted: true,
  closed: false,
  runway_ends: [
    { ident: "09", heading_true_deg: 90, traffic: "left", lat: 0, lon: 0 },
    { ident: "27", heading_true_deg: 270, traffic: "right", lat: 0, lon: 1 / 60 },
  ],
} as unknown as Runway;

// The pattern's side, its legs' places and the way out are the engine's,
// each tested there (engine/facade/tests/runway/fit_cases.rs): here, that the
// runway's length and ends and the end landed on reach the call, and the legs
// and the entry are read into the shapes the map draws.
describe("a runway's traffic pattern", () => {
  test("is its legs in the order flown, to the threshold landed on, and the 45° entry", () => {
    const p = trafficPattern("KTST", RUNWAY, "09", 1800)!;
    expect(p.legs.map((l) => l.name)).toEqual(["Upwind", "Crosswind", "Downwind", "Base", "Final"]);
    expect(p.legs.at(-1)!.to).toEqual({ lat: 0, lon: 0 });
    expect(Math.round(bearingDeg(p.entry.from, p.entry.to))).toBe(225);
  });

  test("is not drawn where the end's threshold is not known", () => {
    const unsurveyed = { ...RUNWAY, runway_ends: RUNWAY.runway_ends!.map((e) => ({ ...e, lat: null, lon: null })) } as Runway;
    expect(trafficPattern("KTST", unsurveyed, "09", 1800)).toBeNull();
  });

  test("is kept in the address by field", () => {
    const picked = patternsOf("kdlh:27, C81:24,bad,KX:9Q");
    expect([...picked]).toEqual([
      ["KDLH", "27"],
      ["C81", "24"],
    ]);
    expect(patternsParam(picked)).toBe("KDLH:27,C81:24");
  });
});

describe("the way out of a field left from", () => {
  test("is a departure, its exit by the field it heads for: straight out ahead, a 45° turn for one off the pattern's side", () => {
    const ahead = departurePattern("KTST", RUNWAY, "09", 1800, { lat: 0, lon: 2 })!;
    expect(ahead.kind).toBe("departure");
    expect(ahead.entry.name).toBe("Straight out");
    expect(departurePattern("KTST", RUNWAY, "09", 1800, { lat: 1, lon: 0.5 })!.entry.name).toBe("45° departure");
  });
});
