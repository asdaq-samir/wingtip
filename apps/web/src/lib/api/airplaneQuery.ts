import { OWN_AIRPLANE } from "../airplane/figures";
import type { AircraftChoice } from "./types";

/**
 * The airplane as the planner's queries take it (the nav log, the local
 * flight, the route options): a stock profile by name with the pilot's own
 * figures over it, or OWN_AIRPLANE, a pilot's own airplane of no stock type
 * planned on its figures alone (wingtip.planning); none with no airplane.
 * Every figure the record carries goes with it -- the start and taxi fuel,
 * the glide ratio, the sea-level climb rate and the ceiling too -- so no
 * gap is filled from another airplane (the owner, 2026-11-09). A module of
 * its own so client.ts does not grow.
 */
export function plannerAircraft(aircraft?: AircraftChoice): string | undefined {
  if (!aircraft || aircraft.none) return undefined;
  if (aircraft.profile) return aircraft.profile;
  // An N-number of no type known yet, with the pilot's own speed and burn
  // set on this device: planned on them alone.
  return aircraft.cruiseTasKt != null && aircraft.fuelBurnGph != null ? OWN_AIRPLANE : undefined;
}

/** The airplane's query parameters, each left out where not set. */
export function airplaneQuery(aircraft?: AircraftChoice) {
  return {
    aircraft: plannerAircraft(aircraft),
    cruise_tas_kt: aircraft?.cruiseTasKt,
    fuel_burn_gph: aircraft?.fuelBurnGph,
    usable_fuel_gal: aircraft?.usableFuelGal,
    climb_tas_kt: aircraft?.climbTasKt,
    climb_fuel_burn_gph: aircraft?.climbFuelBurnGph,
    descent_ias_kt: aircraft?.descentIasKt,
    descent_fuel_burn_gph: aircraft?.descentFuelBurnGph,
    cruise_power_pct: aircraft?.cruisePowerPct,
    service_ceiling_ft: aircraft?.serviceCeilingFt,
    climb_rate_fpm: aircraft?.climbRateFpm,
    taxi_fuel_gal: aircraft?.taxiFuelGal,
    glide_ratio: aircraft?.glideRatio,
  };
}
