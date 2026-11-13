import type { Aircraft, AircraftProfileSummary } from "../api/types";

/**
 * The airplanes the airplane tests fly: the stock C172's book figures as
 * the planner's /api/aircraft-profiles gives them (data/aircraft/c172.json,
 * the Cessna 172S POH: 122 kt, 8.4 gph, a 14,000 ft ceiling, 1.4 gal to
 * start and taxi, 9 to 1 glide), and a pilot's record of any type.
 */
export const C172: AircraftProfileSummary = {
  name: "c172",
  type: "Cessna 172S",
  cruise_tas_kt: 122,
  fuel_burn_gph: 8.4,
  service_ceiling_ft: 14000,
  taxi_fuel_gal: 1.4,
  glide: { ratio: 9, best_glide_kias: 68, source: "Cessna 172S POH, section 3" },
};

/** A pilot's record, its own figures none until given. */
export function record(over: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 7,
    tailNumber: "N123AB",
    typeDesignator: "C172",
    cruiseTasKt: 122,
    fuelBurnGph: 8.4,
    cruisePowerPct: null,
    climbTasKt: null,
    climbFuelBurnGph: null,
    descentIasKt: null,
    descentFuelBurnGph: null,
    usableFuelGal: null,
    equipment: null,
    surveillance: null,
    colour: null,
    handbook: null,
    figures: {
      serviceCeilingFt: null,
      climbRateFpm: null,
      taxiFuelGal: null,
      glideRatio: null,
      emptyWeightLb: null,
      emptyMomentLbIn: null,
    },
    ...over,
  } as Aircraft;
}
