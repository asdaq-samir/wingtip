/**
 * The emergency assistant's rules, the shared engine's (through
 * lib/engine), as the iPhone and Android ask them by the same names:
 *
 * - `bestFields`: the fields within a glide, ranked with their reasons
 *   (engine/crates/brief/src/fields), from the planner's
 *   /api/emergency/fields answer and own ship's fix;
 * - `maydayCall`: the distress call in AIM 6-3-2(a)(3)'s order, the code
 *   (AIM 6-2-2) and the frequencies to try (AIM 6-3-1(d))
 *   (engine/crates/radio/src/mayday.rs);
 * - `checklistSection`: which of the pilot's own emergency checklist's
 *   sections is the one asked, "Engine failure in flight" by default.
 *
 * Nothing here weighs a field or words a call: it shapes what the planner
 * sent into what the engine reads.
 */
import type { EmergencyFields } from "../../lib/api/types";
import { compassPoint } from "../../lib/compass";
import { callEngine, type EngineAnswer, type EngineInput } from "../../lib/engine/engine";
import type { LatLon } from "../../lib/geo";
import type { Fix } from "../../lib/map/position/ownShip";
import { fixRadialDistance, type Station } from "../../lib/navaid";

export type BestFields = EngineAnswer<"best_fields">;
export type BestField = BestFields["fields"][number];
export type Mayday = EngineAnswer<"mayday_call">;

/** The phase the checklist opens at (GAMA Specification No. 1, Section 3,
 *  the engine's EMERGENCY_PHASES). */
export const ENGINE_FAILURE = "Engine failure in flight";

/** The fields ranked from own ship, in "glide" mode: the airplane's
 *  figures as the planner sent them (none: the glide is not guessed). */
export function bestFields(data: EmergencyFields, fix: Pick<Fix, "lat" | "lon" | "altitudeFt" | "speedKt">, variationDeg: number | null): BestFields {
  const input: EngineInput<"best_fields"> = {
    mode: "glide",
    at: { lat: fix.lat, lon: fix.lon },
    altitude_ft: fix.altitudeFt,
    speed_kt: fix.speedKt,
    wind: data.wind ?? null,
    variation_deg: variationDeg,
    airplane: data.airplane
      ? { glide: data.airplane.glide ?? null, landing: data.airplane.landing ?? null, crosswind: data.airplane.crosswind ?? null, cruise_tas_kt: data.airplane.cruise_tas_kt ?? null }
      : null,
    fields: data.fields.map(f => ({
      ident: f.ident, name: f.name, lat: f.lat, lon: f.lon, elevation_ft: f.elevation_ft ?? null,
      runways: f.runways, metar: f.metar ?? null, towered: f.towered, private: f.private, military: f.military,
    })),
  };
  return callEngine("best_fields", input);
}

/** The call, filled from what the screen knows; a part not known is left
 *  for the pilot to say. `frequencies` are the fields' ATC ones, each with
 *  its field's distance. */
export function maydayCall(facts: Omit<EngineInput<"mayday_call">, "frequencies">, data: EmergencyFields | undefined): Mayday {
  const frequencies = (data?.fields ?? []).flatMap(f =>
    f.frequencies.map(q => ({ ident: f.ident, kind: q.kind, mhz: q.mhz, distance_nm: f.distance_nm })));
  return callEngine("mayday_call", { ...facts, frequencies });
}

/** Where own ship is as a controller gives it: off the nearest VOR on the
 *  map ("BAE 238° 18 nm", AIM 5-1-6's fix/radial/distance, the engine's),
 *  else how far and which way from the nearest field ("3 nm SW of Grand
 *  Geneva Resort"); null with neither. */
export function positionWords(at: LatLon, stations: readonly Station[], nearest: { name: string; distance_nm: number; bearing_deg: number } | undefined): string | null {
  const frd = fixRadialDistance(at, stations);
  if (frd) return frd;
  if (!nearest) return null;
  // The airplane from the field: the reciprocal of the bearing to it.
  return `${Math.round(nearest.distance_nm)} nm ${compassPoint(nearest.bearing_deg + 180)} of ${nearest.name}`;
}

/** Magnetic variation at a point today, east positive (the engine's WMM). */
export function variationAt(at: LatLon): number {
  return callEngine("magnetic_variation", { lat: at.lat, lon: at.lon, date: new Date().toISOString().slice(0, 10) });
}

/** The index of the section of `titles` that is `want`; null where none. */
export function checklistSection(titles: string[], want: string = ENGINE_FAILURE): number | null {
  return callEngine("checklist_section", { titles, want });
}
