/**
 * How one runway end suits the airplane today, for its chip in FPL's list
 * (ProceduresRoute), at the owner's asks: the crosswind on it against the
 * most the POH demonstrates, and the POH's short-field distance over a
 * 50 ft obstacle for the airplane's weight, the field's pressure and
 * density altitude and the headwind on it, against the runway's length
 * -- what 14 CFR 91.103(b) asks a pilot to know. Worked out by the
 * shared engine (runway_end_fit, engine/crates/brief/src/runway/fit.rs,
 * through lib/engine) with the Brief's runway check's own evaluator, which
 * says the same for the runway flown: the rules and their sources live
 * there, and its answer is the one shown, as the contract names it.
 */
import type { AircraftProfile, Runway } from "../../lib/api/types";
import { callEngine, type EngineAnswer } from "../../lib/engine/engine";
import type { RunwayEnd } from "../plan";

/** A wind as a METAR reports it: true, in knots, and its variable
 *  direction's two bounds where it reports one ("230V310", FMH-1 chapter
 *  12), which the engine judges the crosswind at the worst of. */
export interface FitWind {
  dirTrueDeg: number | null | undefined;
  speedKt: number | null | undefined;
  gustKt: number | null | undefined;
  variableDeg?: [number, number] | null;
}

/** How an end fits (the engine's runway_end_fit): its crosswind (gusts'
 *  where more) against the POH's demonstrated, the distance over a 50 ft
 *  obstacle against the length judged (`short`, or `close` within the
 *  engine's DISTANCE_MARGIN, SAFO 19001's 15 per cent; `unknown` where
 *  either is not known; `beyond` read past the POH's table), the steady
 *  wind's tailwind, and the finding, worst first. */
export type EndFit = EngineAnswer<"runway_end_fit">;

export function endFit({
  aircraft,
  runway,
  end,
  wind,
  elevationFt,
  altimeterInHg,
  tempC,
  weightLb,
  kind,
}: {
  aircraft: AircraftProfile | null | undefined;
  runway: Runway;
  end: RunwayEnd;
  wind: FitWind | null;
  /** Null where not known: no distance is worked out then. */
  elevationFt: number | null;
  altimeterInHg: number | null | undefined;
  tempC: number | null | undefined;
  weightLb: number | null;
  kind: "takeoff" | "landing";
}): EndFit {
  return callEngine("runway_end_fit", {
    aircraft: aircraft
      ? { takeoff: aircraft.takeoff ?? null, landing: aircraft.landing ?? null, crosswind: aircraft.crosswind ?? null }
      : null,
    runway,
    // The end by its ident, so a landing on it is judged against its own
    // landing distance available or past its displaced threshold (NASR
    // APT_RWY_END; AIM 2-3-3), the engine reading them from the runway's
    // ends.
    end: { ident: end.ident, heading_true_deg: end.heading_true_deg ?? null },
    // The variable arc too: 27015G25KT 230V310 is 16 kt across 27 at its
    // worst, where the mean alone read 0.
    wind: wind
      ? {
          dir_true_deg: wind.dirTrueDeg ?? null,
          speed_kt: wind.speedKt ?? null,
          gust_kt: wind.gustKt ?? null,
          variable_deg: wind.variableDeg ?? null,
        }
      : null,
    elevation_ft: elevationFt,
    altimeter_in_hg: altimeterInHg ?? null,
    temp_c: tempC ?? null,
    weight_lb: weightLb,
    kind,
  });
}
