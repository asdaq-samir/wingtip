/**
 * A field's forecast, as the briefing's weather reads it (WeatherAlongRoute)
 * and the Brief's glance says it (features/plan/lib/glance): the places of the route in
 * order, a field's own TAF or the nearest within the engine's reach
 * (`field_taf`, 25 nm), and the flight category for when the flight is
 * there.
 */
import type { Briefing, Course } from "../../../../lib/api/types";
import { legsNm } from "../../../../lib/geo";
import { categoryOf } from "../../../../lib/map/marks/flightCategory";
import { callEngine } from "../../../../lib/engine/engine";

export type Station = Briefing["forecast"]["stations"][number];

interface Place {
  ident: string;
  role: string;
  lat: number;
  lon: number;
  alongNm: number;
}

export function placesOf(course: Course): Place[] {
  const points = [course.departure, ...(course.stops ?? []), course.destination];
  // A local flight, one field to itself, is one place.
  if (points.length === 2 && points[0]!.ident === points[1]!.ident) {
    const p = points[0]!;
    return [{ ident: p.ident, role: "Local", lat: p.lat, lon: p.lon, alongNm: 0 }];
  }
  const legs = legsNm(points);
  let along = 0;
  return points.flatMap((p, i) => {
    if (i > 0) along += legs[i - 1]!;
    if (p.kind === "fix") return [];
    const role = i === 0 ? "Departure" : i === points.length - 1 ? "Destination" : "Stop";
    return [{ ident: p.ident, role, lat: p.lat, lon: p.lon, alongNm: along }];
  });
}

/** The TAF that speaks for a field, the engine's (`field_taf`): its own,
 *  else the nearest within its reach where `at` is given. */
const fieldTaf = (stations: Station[], ident: string, at: { lat: number; lon: number } | null) =>
  callEngine("field_taf", {
    ident,
    at: at ? { lat: at.lat, lon: at.lon } : null,
    stations: stations.map((s) => ({ icao_id: s.icaoId, lat: s.lat ?? null, lon: s.lon ?? null })),
  });

/** How far a TAF is taken to speak for a field without its own, nm. */
export const tafReachNm = (): number => fieldTaf([], "", null).reach_nm;

/** A field's own TAF: the station whose ICAO id is its ident, or K and a
 *  three-letter ident. */
export function ownStation(stations: Station[], ident: string): Station | undefined {
  const found = fieldTaf(stations, ident, null);
  return found.index == null ? undefined : stations[found.index];
}

export const categoryAt = (station: Station) => categoryOf(station.eta_ceiling_ft, station.eta_visibility_sm);

/** The nearest TAF to a field without its own, within the engine's reach,
 *  and how far it is; none past that (or where it has its own). */
export function nearestStation(stations: Station[], place: Place): { s: Station; nm: number } | undefined {
  const found = fieldTaf(stations, place.ident, place);
  return found.index == null || found.nm == null ? undefined : { s: stations[found.index]!, nm: found.nm };
}

/** A field's flight category for when the flight is there, as its
 *  Forecast row says it: its own TAF's, else the nearest's; else its
 *  METAR's; null where none says. The Brief's glance (features/plan/lib/glance). */
export function fieldCategory(briefing: Briefing, course: Course, ident: string): string | null {
  const stations = briefing.forecast.stations;
  const place = placesOf(course).find((p) => p.ident === ident);
  const station = ownStation(stations, ident) ?? (place ? nearestStation(stations, place)?.s : undefined);
  return (station ? categoryAt(station) : null) ?? briefing.metars[ident]?.flight_category ?? null;
}
