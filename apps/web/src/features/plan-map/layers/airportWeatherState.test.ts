import { describe, expect, it } from "vitest";
import type { AirportPin } from "../../../lib/api/types";
import { colourOf } from "../../../lib/map/marks/flightCategory";
import { foldWeather, type WeatherAnswer } from "./airportWeatherState";

const pin = (ident: string, lat: number, lon: number, flight_category: string | null) =>
  ({ ident, lat, lon, flight_category }) as AirportPin;
const BOX_A = { south: 41, west: -89, north: 43, east: -87 };
const BOX_B = { south: 43.5, west: -89, north: 45, east: -87 };
const answer = (box: typeof BOX_A, fields: AirportPin[], full = false): WeatherAnswer => ({ box, fields, full });
const colours = (kept: Map<string, { colour: string }>) => Object.fromEntries([...kept].map(([i, k]) => [i, k.colour]));

describe("the fields' weather the map keeps", () => {
  it("changes only where a field's colour does", () => {
    const kept = new Map();
    const fields = [pin("KMSN", 43, -89.3, "VFR"), pin("KORD", 41.98, -87.9, "IFR")];
    expect(foldWeather(kept, [answer(BOX_A, fields)])).toBe(true);
    // The ten-minute refresh saying the same: nothing to send.
    expect(foldWeather(kept, [answer(BOX_A, [...fields])])).toBe(false);
    expect(foldWeather(kept, [answer(BOX_A, [fields[0]!, pin("KORD", 41.98, -87.9, "MVFR")])])).toBe(true);
    expect(colours(kept).KORD).toBe(colourOf("MVFR"));
  });

  it("keeps the last box's fields as a new box comes, and drops one whose box no longer has it", () => {
    const kept = new Map();
    foldWeather(kept, [answer(BOX_A, [pin("KORD", 41.98, -87.9, "IFR")])]);
    // Panned north: KORD is outside the new box and keeps its colour.
    expect(foldWeather(kept, [answer(BOX_B, [pin("KOSH", 43.98, -88.56, "VFR")])])).toBe(true);
    expect(Object.keys(colours(kept)).sort()).toEqual(["KORD", "KOSH"]);
    // Back over KORD's box, its METAR gone missing: no old colour kept for it.
    expect(foldWeather(kept, [answer(BOX_A, [])])).toBe(true);
    expect(Object.keys(colours(kept))).toEqual(["KOSH"]);
  });

  it("drops none on an answer cut at the planner's limit, nor one the route's answer still has", () => {
    const kept = new Map();
    foldWeather(kept, [answer(BOX_A, [pin("KORD", 41.98, -87.9, "IFR")])]);
    expect(foldWeather(kept, [answer(BOX_A, [], true)])).toBe(false);
    expect(foldWeather(kept, [answer(BOX_B, [pin("KORD", 41.98, -87.9, "IFR")]), answer(BOX_A, [])])).toBe(false);
    expect(Object.keys(colours(kept))).toEqual(["KORD"]);
  });
});
