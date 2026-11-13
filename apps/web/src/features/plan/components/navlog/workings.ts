/**
 * A leg of the nav log worked out the way a student shows it on the
 * examiner's nav log (PA.I.D, cross-country flight planning): the wind
 * triangle from the true course to the magnetic heading, the ground
 * speed, the time and the fuel, each with its sum. The planner has
 * already done every step (wingtip.navlog); this lays them out, and checks a
 * student's own figures against them within an E6B's accuracy.
 */
import type { Leg } from "../../../../lib/api/types";
import { callEngine } from "../../../../lib/engine/engine";
import { bearing, grouped, magneticVariation, windCorrection } from "../../../../lib/format";

/** What the student works out; how far off an E6B allows is the
 *  engine's (`workings_right`). */
export const ANSWERS = [
  { key: "wca", label: "Wind correction", unit: "°" },
  { key: "th", label: "True heading", unit: "°" },
  { key: "mh", label: "Magnetic heading", unit: "°" },
  { key: "gs", label: "Ground speed", unit: "kt" },
  { key: "ete", label: "Time", unit: "min" },
  { key: "fuel", label: "Fuel", unit: "gal" },
] as const;

export type AnswerKey = (typeof ANSWERS)[number]["key"];

/** A figure as the student would write it: a heading round the compass,
 *  the correction signed, the rest to its unit's precision. The leg's
 *  workings' and the diversion drill's (whose figures are four of these). */
export function written(key: AnswerKey, value: number): string {
  if (key === "th" || key === "mh") return bearing(value);
  if (key === "wca") return windCorrection(value);
  if (key === "fuel") return `${value.toFixed(1)} gal`;
  return `${Math.round(value)} ${key === "gs" ? "kt" : "min"}`;
}

/** The phase of flight a row is flown in, its figures that phase's. */
export type Phase = "climb" | "descent" | "cruise";

export interface Workings {
  /** The steps in order, each a name, its sum and its result. */
  steps: { name: string; sum: string; result: string }[];
  /** The figures a student is asked for, of the one phase the row is
   *  flown in: the climb's, the cruise's or the descent's. */
  answers: Record<AnswerKey, number>;
  /** Which phase the figures are: a climbing or descending row's are that
   *  phase's own (the engine puts them on the leg, or on its top of climb
   *  or descent for the piece of it). */
  phase: Phase;
  /** What the leg's climb adds, where it has one: the log's own time and
   *  fuel are the cruise's and this. */
  climb: { min: number; gal: number } | null;
  /** What the leg's procedure adds -- a pattern's, a departure's or an
   *  approach's miles past the leg's line -- where it is flown by one. */
  procedure: { nm: number; min: number; gal: number; landing: boolean } | null;
}

/** A leg worked out, or null for one that cannot be (no wind is a calm
 *  leg; a wind faster than the airplane, no leg at all). `phase`: the
 *  phase the row is flown in (rows' phaseOf), its figures that phase's. */
export function workingsOf(leg: Leg, phase: Phase = "cruise"): Workings | null {
  if (leg.groundspeed_kt == null || leg.groundspeed_kt <= 0 || leg.ete_min == null || leg.fuel_gal == null) return null;
  // No airplane, no wind triangle to work: its figures are an airplane's.
  if (
    leg.tas_kt == null ||
    leg.wca_deg == null ||
    leg.true_heading_deg == null ||
    leg.magnetic_heading_deg == null ||
    leg.fuel_burn_gph == null ||
    leg.power_pct == null ||
    leg.density_altitude_ft == null
  )
    return null;
  const tc = leg.true_course_deg;
  const windDir = leg.wind?.wind_dir_true_deg ?? 0;
  const windKt = leg.wind?.wind_speed_kt ?? 0;
  const tas = leg.tas_kt;
  // The planner's own figures (wingtip.navlog), which the log's rows show:
  // the sums below are how they are reached.
  const wca = leg.wca_deg;
  const th = leg.true_heading_deg;
  const variation = leg.magnetic_variation_deg;
  const mh = leg.magnetic_heading_deg;
  const gs = leg.groundspeed_kt;
  const ete = (leg.distance_nm / gs) * 60;
  const fuel = (ete / 60) * leg.fuel_burn_gph;
  // A procedure's miles (a pattern, a departure, an approach) are flown
  // at the leg's ground speed and burn, and in its time and fuel
  // (LegProcedure's more_*): said as their own, not as climb, which they
  // were taken for -- "Climb, added 2 min" on a leg with none to climb
  // (the FPL audit's A4).
  const p = leg.procedure;
  const procedure = p && p.more_nm > 0.05 ? { nm: p.more_nm, min: p.more_min ?? 0, gal: p.more_gal ?? 0 } : null;
  const climbMin = leg.ete_min - ete - (procedure?.min ?? 0);
  const climbGal = leg.fuel_gal - fuel - (procedure?.gal ?? 0);
  const east = variation >= 0;
  const r1 = (n: number) => n.toFixed(1);
  const steps = [
    { name: "True course", sum: "measured on the chart", result: bearing(tc) },
    {
      name: "Wind",
      sum: leg.wind ? `forecast at ${grouped(leg.altitude_ft)} ft, from true north` : "no forecast near: calm",
      result: `${bearing(windDir)} at ${Math.round(windKt)} kt`,
    },
    {
      name: "True airspeed",
      // A climb or a descent is flown at the airplane's speed for it, not
      // at a cruise power setting (FAA-H-8083-25C ch. 16: each phase at
      // its own figures); the descent's is its indicated speed made true
      // at the descent's altitude.
      sum:
        phase === "climb"
          ? "the airplane's climb speed"
          : phase === "descent"
            ? "the airplane's descent speed, indicated, at the descent's altitude"
            : `${Math.round(leg.power_pct)}% power at a density altitude of ${grouped(leg.density_altitude_ft)} ft`,
      result: `${Math.round(tas)} kt`,
    },
    {
      name: "Wind correction",
      sum: `sin⁻¹(${Math.round(windKt)} × sin(${bearing(windDir)} − ${bearing(tc)}) ÷ ${Math.round(tas)})`,
      result: Math.round(wca) === 0 ? "0° (none)" : `${windCorrection(wca)} (${wca >= 0 ? "right" : "left"})`,
    },
    { name: "True heading", sum: `${bearing(tc)} ${wca >= 0 ? "+" : "−"} ${Math.abs(wca).toFixed(0)}°`, result: bearing(th) },
    {
      name: "Magnetic heading",
      sum: `${bearing(th)} ${east ? "−" : "+"} ${magneticVariation(variation)} (east is least, west is best)`,
      result: bearing(mh),
    },
    { name: "Compass heading", sum: "the magnetic heading with the deviation card's correction for it", result: bearing(mh) },
    {
      name: "Ground speed",
      sum: `${Math.round(tas)} × cos ${Math.abs(wca).toFixed(0)}° − ${Math.round(windKt)} × cos(${bearing(windDir)} − ${bearing(tc)})`,
      result: `${Math.round(gs)} kt`,
    },
    { name: "Time", sum: `${r1(leg.distance_nm)} nm ÷ ${Math.round(gs)} kt × 60`, result: `${Math.round(ete)} min` },
    {
      name: "Fuel",
      sum: `${Math.round(ete)} min at ${phase === "cruise" ? "" : `the ${phase}'s `}${r1(leg.fuel_burn_gph)} gal/h`,
      result: `${r1(fuel)} gal`,
    },
  ];
  return {
    steps,
    answers: { wca, th, mh, gs, ete, fuel },
    phase,
    climb: climbMin > 0.5 ? { min: climbMin, gal: Math.max(0, climbGal) } : null,
    procedure: procedure && procedure.min > 0 ? { ...procedure, landing: p!.landing } : null,
  };
}

/** Whether a student's figure is right within the answer's tolerance,
 *  the engine's (`workings_right`): headings compared round the compass
 *  (359° is 1° from 000°). */
export function checks(key: AnswerKey, typed: number, answer: number): boolean {
  return callEngine("workings_right", { key, typed, answer });
}
