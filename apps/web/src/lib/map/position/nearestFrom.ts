import type { Geo, LatLon } from "../../geo";

/** A field the nearest list gives, with where it is and the planner's own
 *  distance and bearing (from the point it was asked from). */
interface Placed {
  lat: number;
  lon: number;
  distance_nm: number;
  bearing_deg: number;
}

/**
 * The nearest fields measured again from `at`, nearest first. The list is
 * asked for from the position rounded to a twentieth of a degree, so a GPS
 * fix does not ask again at every move (lib/queryClient's nearestQuery);
 * its distances and bearings are from that rounded point, up to about 3 nm
 * off, and a pilot turning to a row's arrow was given the wrong way and
 * the wrong miles (the audit's WEB-3: C81 read 1.9 nm SW from C81 itself).
 * Each field's great circle from the fix is the engine's (lib/geo's Geo:
 * WGS-84, Karney's geodesic), handed in once the engine is loaded.
 */
export function nearestFrom<T extends Placed>(fields: readonly T[], at: LatLon, geo: Geo): T[] {
  return fields
    .map((f) => ({ ...f, distance_nm: geo.distanceNm(at, f), bearing_deg: geo.bearingDeg(at, f) }))
    .sort((a, b) => a.distance_nm - b.distance_nm);
}
