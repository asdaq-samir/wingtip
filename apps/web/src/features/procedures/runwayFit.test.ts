import { describe, expect, it } from "vitest";
import c172Json from "../../../../../data/aircraft/c172.json?raw";
import type { AircraftProfile, Runway, ShortField } from "../../lib/api/types";
import type { RunwayEnd } from "../plan";
import { callEngine } from "../../lib/engine/engine";

// The engine's one evaluator of a runway end's distance (runways.rs), the
// runway check's and FPL's chips', asked by name through the .wasm.
// The air a field's distances are worked out in: the pressure altitude off
// the altimeter, the standard atmosphere's height of the setting above
// 29.92 (FAA-H-8083-25C ch. 11, Figure 11-3: 29.7 "Hg is +205 ft), and the
// temperature.
const fieldAir = (elevationFt: number, altimeterInHg: number, tempC: number) => ({
  pressureAltFt: elevationFt + (1 - (altimeterInHg / 29.92) ** (1 / 5.2558797)) * 145442.16,
  tempC,
});
const endDistance = (
  table: ShortField,
  runway: Runway | undefined,
  air: { pressureAltFt: number; tempC: number },
  weightLb: number,
  headwindKt: number,
) => {
  const d = callEngine("gonogo_end_distance", {
    table,
    runway: runway ?? null,
    pressure_alt_ft: air.pressureAltFt,
    temp_c: air.tempC,
    weight_lb: weightLb,
    headwind_kt: headwindKt,
  });
  return { totalFt: d.total_ft, over: d.over };
};
import { endFit } from "./runwayFit";

const c172 = { name: "c172", ...JSON.parse(c172Json) } as AircraftProfile;
const runway = (length: number) =>
  ({ ends: "09/27", length_ft: length, surface: "ASP", closed: false, runway_ends: [] }) as unknown as Runway;
const end27 = { ident: "27", heading_true_deg: 270 } as unknown as RunwayEnd;
const at = { aircraft: c172, end: end27, elevationFt: 900, altimeterInHg: 29.92, tempC: 15, weightLb: 2550, kind: "takeoff" as const };

// The crosswind against the POH's, the 15 per cent margin and the distance
// at no weight known are the engine's, each tested there
// (engine/facade/tests/runway/fit_cases.rs): here, that the page's wind,
// air, weight and runway reach "runway_end_fit" and each mark is read back.
describe("a runway end's fit", () => {
  it("says the crosswind, its gusts' where more, against the POH's demonstrated 15 kt", () => {
    // 360 at 12 gusting 20 across 27: 12 and 20 kt from the right.
    const fit = endFit({ ...at, runway: runway(5000), wind: { dirTrueDeg: 360, speedKt: 12, gustKt: 20 } });
    expect(fit.crosswind_kt).toBe(20);
    expect(fit.crosswind_over).toBe(true);
  });

  it("marks a runway within the 15 per cent margin as close, not short", () => {
    const still = { dirTrueDeg: null, speedKt: 0, gustKt: null };
    const needed = endFit({ ...at, runway: runway(10000), wind: still }).needed_ft!;
    const close = endFit({ ...at, runway: runway(Math.round(needed * 1.1)), wind: still });
    expect([close.short, close.close]).toEqual([false, true]);
  });

  it("is the runway check's own distance, the field's air, weight and headwind alike", () => {
    // 270 at 10 straight down 27, a grass runway, a warm low day at the field.
    const grass = { ...runway(3000), surface: "TURF" } as Runway;
    const fit = endFit({ ...at, runway: grass, tempC: 30, altimeterInHg: 29.72, wind: { dirTrueDeg: 270, speedKt: 10, gustKt: null } });
    const checked = endDistance(c172.takeoff!, grass, fieldAir(900, 29.72, 30), 2550, 10);
    expect(fit.needed_ft).toBe(Math.round(checked.totalFt));
  });

  it("sends the report's variable arc: 27015G25KT 230V310 is 16 kt across 27, not 0", () => {
    // FMH-1 chapter 12, AIM 7-1-28: the gust at 40 degrees off, 25 sin 40.
    const wind = { dirTrueDeg: 270, speedKt: 15, gustKt: 25, variableDeg: [230, 310] as [number, number] };
    expect(endFit({ ...at, runway: runway(5000), wind }).crosswind_kt).toBe(16);
  });

  it("says when no temperature was reported, the distances a standard day's", () => {
    const fit = endFit({ ...at, tempC: null, runway: runway(10000), wind: null });
    expect([fit.temp_assumed, fit.fit]).toEqual([true, "standard_day"]);
  });
});
