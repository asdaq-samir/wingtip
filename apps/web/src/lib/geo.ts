/** Great-circle distance, course and the point a course and distance out,
 *  on the engine's sphere of 3,440.065 nm (engine/crates/core/src/geo.rs):
 *  the planner (wingtip.geo) and the phones ask the same rules, so a card's
 *  "18 nm NE" is the nav log's figure, worked out in one place (the owner,
 *  2026-11-12: the geo maths moves into the engine). Synchronous, as
 *  callEngine is: asked while drawing, from inside an engine gate
 *  (lib/engine/engineGate) or after useEngineReady says it is there. */
import { callEngine } from "./engine/engine";

/** Degrees to radians, and back: each file that turned a bearing or a
 *  latitude into one wrote its own. */
export const rad = (deg: number) => (deg * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;

export type LatLon = { lat: number; lon: number };

const ends = (a: LatLon, b: LatLon) => ({ lat1: a.lat, lon1: a.lon, lat2: b.lat, lon2: b.lon });

export function distanceNm(a: LatLon, b: LatLon): number {
  return callEngine("distance_nm", ends(a, b));
}

/** Each leg's length, nm, between successive `points`, asked of the
 *  engine at once (`great_circles`): a flown trail is thousands of fixes. */
export function legsNm(points: LatLon[]): number[] {
  const from = points.slice(0, -1),
    to = points.slice(1);
  return callEngine("great_circles", {
    lat1: from.map((p) => p.lat),
    lon1: from.map((p) => p.lon),
    lat2: to.map((p) => p.lat),
    lon2: to.map((p) => p.lon),
  }).distance_nm;
}

/** Where a stop at `at` goes in a route's stops so it adds the least
 *  distance: between the two of `points` -- the departure, the stops,
 *  the destination -- it bends the route least between. The index into
 *  the stops. */
export function bestStopIndex(points: LatLon[], at: LatLon): number {
  const direct = legsNm(points);
  let best = 0,
    bestAdded = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const added = distanceNm(points[i]!, at) + distanceNm(at, points[i + 1]!) - direct[i]!;
    if (added < bestAdded) [best, bestAdded] = [i, added];
  }
  return best;
}

/** True bearing from `a` to `b`, 0 to 360; 0 to itself. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  return callEngine("bearing_deg", ends(a, b));
}

/** A direction brought into 0 up to 360, whatever sign or size it came
 *  as: -10 is 350, 370 is 10. Eleven files wrote this sum out. */
export const normalizeDeg = (d: number) => ((d % 360) + 360) % 360;

/** How far apart two directions are, 0 to 180: a track off a course, a
 *  wind off a runway, an estimate off its answer round the compass (358
 *  is 4 from 002). It was written eight times, two ways. */
export function angleBetween(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/** The turn from one direction to another, -180 to 180, right of it
 *  positive. */
export function signedTurn(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** Feet in a nautical mile (1,852 m). */
export const FT_PER_NM = 6076.12;

/** Metres in a nautical mile, the international one. */
export const M_PER_NM = 1852;

/** Metres in a foot, the international one (exactly 0.3048 m): the one
 *  place the web turns feet to metres, which five files once wrote each. */
export const M_PER_FT = 0.3048;

/** Where a great circle from `a` on a true bearing reaches `nm` out. */
export function destination(a: LatLon, bearing: number, nm: number): LatLon {
  return callEngine("destination", { points: [{ lat: a.lat, lon: a.lon, bearing_deg: bearing, nm }] })[0]!;
}
