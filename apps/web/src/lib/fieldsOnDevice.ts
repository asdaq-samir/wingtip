import type { AirportIndex } from "./airportIndex";
import type { NearestAirport } from "./api/types";
import { callEngine, type EngineInput } from "./engine/engine";
import type { LatLon } from "./geo";

/**
 * The fields round a point from the airport index the browser keeps
 * (lib/airportIndex, the planner's search index, kept a week by the
 * service worker), for Emergency and Nearest when the planner cannot be
 * asked: in the air, most of a flight. The index holds each field's
 * ident, name, town, size and position, and nothing else -- no runway,
 * elevation, weather or whether it is private -- so what is said from it
 * says so ("From this device, without weather"), and the engine's
 * best_fields ranks them nearest first, its distances and courses on the
 * great circle (FAA-H-8083-25C ch. 16), as it does the planner's.
 */

/** One field of the index, as best_fields reads a candidate: what is not
 *  known, null or none, never guessed. */
export type DeviceField = EngineInput<"best_fields">["fields"][number] & { town: string; size: number };

/** The sizes of field kept: OurAirports' large, medium and small
 *  airports, the planner's landing fields (wingtip.airports _FIELD_KINDS);
 *  not a heliport, a seaplane base or a balloonport. */
const LANDING_SIZE_MAX = 2;

/** The `limit` landing fields of the index nearest `at`, nearest first by
 *  a flat measure (squared degrees, the longitude's shrunk by the
 *  latitude's cosine): only the order the engine is then given, never a
 *  figure shown. */
export function fieldsNear(index: AirportIndex, at: LatLon, limit: number): DeviceField[] {
  const shrink = Math.cos((at.lat * Math.PI) / 180);
  const near: [number, number][] = [];
  for (let row = 0; row < index.rows.length; row++) {
    const lat = index.lat[row]!;
    if (Number.isNaN(lat) || index.rows[row]![4] > LANDING_SIZE_MAX) continue;
    near.push([(lat - at.lat) ** 2 + ((index.lon[row]! - at.lon) * shrink) ** 2, row]);
  }
  near.sort((a, b) => a[0] - b[0]);
  return near.slice(0, limit).map(([, row]) => {
    const [ident, name, town, , size] = index.rows[row]!;
    return {
      ident,
      name,
      town,
      size,
      lat: index.lat[row]!,
      lon: index.lon[row]!,
      elevation_ft: null,
      runways: [],
      metar: null,
      towered: null,
      private: null,
      military: null,
    };
  });
}

const KIND: NearestAirport["kind"][] = ["large", "medium", "small", "other"];

/** Nearest's rows from the index, nearest first, with the engine's
 *  distance and true course to each: the filters that need what the index
 *  does not hold (weather, runways, fuel) keep none of them. */
export function nearestOnDevice(index: AirportIndex, at: LatLon, limit: number): NearestAirport[] {
  const fields = fieldsNear(index, at, limit);
  const ranked = callEngine("best_fields", {
    mode: "glide",
    at,
    altitude_ft: null,
    speed_kt: null,
    wind: null,
    variation_deg: null,
    airplane: null,
    fields: fields.map(({ town: _town, size: _size, ...f }) => f),
  });
  const byIdent = new Map(fields.map((f) => [f.ident, f]));
  return ranked.fields.map((f) => {
    const field = byIdent.get(f.ident)!;
    return {
      ident: f.ident,
      name: f.name,
      lat: f.lat,
      lon: f.lon,
      kind: KIND[field.size] ?? "other",
      municipality: field.town || null,
      distance_nm: f.distance_nm,
      bearing_deg: f.course_deg,
      // Not in the index: none known, so a filter that asks for a fuel, a
      // surface or a tower keeps none of these (the line says why).
      fuel: [],
      runway_surfaces: [],
      towered: false,
      private: false,
    };
  });
}
