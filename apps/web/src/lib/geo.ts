/** Distance, course and the point a course and distance out, along the
 *  geodesic on the WGS-84 ellipsoid (engine/crates/core/src/geo.rs):
 *  the planner (wingtip.geo) and the phones ask the same rules, so a card's
 *  "18 nm NE" is the nav log's figure, worked out in one place (the owner,
 *  2026-11-12: the geo maths moves into the engine).
 *
 *  Those rules are reached only through a `Geo`, which exists once the
 *  engine's .wasm is there: `useGeo()` in a component or hook (null until
 *  then), `geoLoaded` where a promise will do. A part that asks before
 *  then is a type error rather than a throw on the phone: five callers
 *  drew before the engine had loaded and were found only at run time
 *  (e385bb20f, f13ad6cb4). The plain sums below need no engine. */
import { callEngine, engineReady } from "./engine/engine";
import { useEngineReady } from "./engine/useEngineReady";

/** Degrees to radians, and back: each file that turned a bearing or a
 *  latitude into one wrote its own. */
export const rad = (deg: number) => (deg * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;

export type LatLon = { lat: number; lon: number };

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

/** Metres in a nautical mile, the international one (NIST SP 811 B.9). */
export const M_PER_NM = 1852;

/** Metres in a foot, the international foot of the 1959 yard and pound
 *  agreement (exactly 0.3048 m, NIST SP 811 B.9): the one place the web
 *  turns feet to metres, which five files once wrote each. */
export const M_PER_FT = 0.3048;

/** Feet in a nautical mile, worked out from the two exact definitions
 *  above (6,076.115 485...), as the engine's core::units does, not the
 *  rounded 6,076.12. */
export const FT_PER_NM = M_PER_NM / M_PER_FT;

/** Knots in a metre a second: a knot is a nautical mile an hour, so 3,600
 *  seconds over the 1,852 m above (1.943 844 49...), not the rounded
 *  1.943844 the browser's GPS speed was once multiplied by (NIST SP 811
 *  B.9). The phones derive it the same way (Units.swift, Units.kt). */
export const KT_PER_M_S = 3600 / M_PER_NM;

/** Feet in a statute mile, the international mile of the 1959 yard and
 *  pound agreement: 5,280 international feet exactly (NIST SP 811 B.9),
 *  the mile flight visibility and cloud distances are given in. */
export const FT_PER_SM = 5280;

/** Metres in a statute mile, from the two exact definitions above
 *  (1,609.344, NIST SP 811 B.9). */
export const M_PER_SM = FT_PER_SM * M_PER_FT;

const ends = (a: LatLon, b: LatLon) => ({ lat1: a.lat, lon1: a.lon, lat2: b.lat, lon2: b.lon });

function distanceNm(a: LatLon, b: LatLon): number {
  return callEngine("distance_nm", ends(a, b));
}

/** Each leg's length, nm, between successive `points`, asked of the
 *  engine at once (`great_circles`): a flown trail is thousands of fixes. */
function legsNm(points: LatLon[]): number[] {
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
function bestStopIndex(points: LatLon[], at: LatLon): number {
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
function bearingDeg(a: LatLon, b: LatLon): number {
  return callEngine("bearing_deg", ends(a, b));
}

/** Where a great circle from `a` on a true bearing reaches `nm` out. */
function destination(a: LatLon, bearing: number, nm: number): LatLon {
  return callEngine("destination", { points: [{ lat: a.lat, lon: a.lon, bearing_deg: bearing, nm }] })[0]!;
}

/** The geodesic rules, each the engine's. Only a loaded engine hands
 *  one out (useGeo, geoLoaded). */
export interface Geo {
  distanceNm: typeof distanceNm;
  legsNm: typeof legsNm;
  bestStopIndex: typeof bestStopIndex;
  bearingDeg: typeof bearingDeg;
  destination: typeof destination;
}

const geo: Geo = { distanceNm, legsNm, bestStopIndex, bearingDeg, destination };

/** The geodesic rules once the engine is there, null while its .wasm is
 *  still coming: a part draws without its figure until then and again
 *  with it (useEngineReady). Handled, never asserted away (eslint.config.js
 *  bans `useGeo()!`). */
export function useGeo(): Geo | null {
  return useEngineReady() ? geo : null;
}

/** The geodesic rules, once the engine is loaded: for what runs outside
 *  a render (a store's subscriber, a test). */
export const geoLoaded: Promise<Geo> = engineReady.then(() => geo);
