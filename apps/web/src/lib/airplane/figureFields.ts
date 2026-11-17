// The figures' names, apart from lib/airplane/figures so lib/api/types can
// build the airplane choice on them without importing what imports it.

/** Each figure's name in the engine and the planner's query (snake case)
 *  and in the app's airplane choice and the gateway's record (camel case). */
export const FIGURE_FIELDS = {
  cruise_tas_kt: "cruiseTasKt",
  fuel_burn_gph: "fuelBurnGph",
  cruise_power_pct: "cruisePowerPct",
  usable_fuel_gal: "usableFuelGal",
  climb_tas_kt: "climbTasKt",
  climb_fuel_burn_gph: "climbFuelBurnGph",
  climb_rate_fpm: "climbRateFpm",
  descent_ias_kt: "descentIasKt",
  descent_fuel_burn_gph: "descentFuelBurnGph",
  service_ceiling_ft: "serviceCeilingFt",
  taxi_fuel_gal: "taxiFuelGal",
  glide_ratio: "glideRatio",
  empty_weight_lb: "emptyWeightLb",
  empty_moment_lb_in: "emptyMomentLbIn",
} as const;

export type FigureKey = keyof typeof FIGURE_FIELDS;
type FigureField = (typeof FIGURE_FIELDS)[FigureKey];
/** An airplane's own figures, by the choice's names: any of them. */
export type OwnFigureValues = Partial<Record<FigureField, number>>;
