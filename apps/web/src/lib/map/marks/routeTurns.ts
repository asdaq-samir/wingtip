import type { ExpressionSpecification } from "maplibre-gl";
import type { Layout } from "../gl/markLayers";
import { mercX, mercY } from "../tileMath";

/**
 * Where a route point's name goes (the owner's option A, 2026-11-14):
 * off the point, on the outside of the turn the course makes there, so
 * the point itself -- the ringed dot where the legs meet, and own ship on
 * it at POS0 -- stays in sight and the name never lies on the line.
 *
 * The side is worked out once a route, north up on the screen (Web
 * Mercator, as the map draws it): the two legs leaving the point, each a
 * unit step, added, point into the turn; the name goes the other way. On
 * a point with one leg (the route's first or last) or a straight one, it
 * goes square to the course, on its upper side. The map's rotation is the
 * layer's (`turnSide`), so a pilot turning the map keeps the names
 * outside.
 */

type LatLon = [number, number];

/** The screen step from `a` towards `b`, north up, y down, as a unit;
 *  null where the two are one point. */
function step(a: LatLon, b: LatLon): [number, number] | null {
  const dx = mercX(b[1]) - mercX(a[1]);
  const dy = mercY(b[0]) - mercY(a[0]);
  const n = Math.hypot(dx, dy);
  return n > 1e-12 ? [dx / n, dy / n] : null;
}

/** The nearest vertex of the course line to the point. */
function nearestVertex(line: LatLon[], at: { lat: number; lon: number }): number {
  let best = 0;
  let bestD = Infinity;
  line.forEach(([lat, lon], i) => {
    const d = (lat - at.lat) ** 2 + (lon - at.lon) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

/** The first step along the line from vertex `i`, going `by` (+1 or -1),
 *  past any vertex on the point itself. */
function legFrom(line: LatLon[], i: number, by: 1 | -1): [number, number] | null {
  for (let j = i + by; j >= 0 && j < line.length; j += by) {
    const s = step(line[i]!, line[j]!);
    if (s) return s;
  }
  return null;
}

/**
 * The side a point's name goes, degrees clockwise from up on a north-up
 * screen: away from the turn at the course line's vertex nearest it
 * (`line` the course's [lat, lon] points, as the planner sends them).
 */
export function outsideOfTurn(line: LatLon[], at: { lat: number; lon: number }): number {
  if (line.length < 2) return 0;
  const i = nearestVertex(line, at);
  const back = legFrom(line, i, -1);
  const ahead = legFrom(line, i, 1);
  const into: [number, number] | null = back && ahead ? [back[0] + ahead[0], back[1] + ahead[1]] : null;
  let out: [number, number];
  if (into && Math.hypot(into[0], into[1]) > 0.05) out = [-into[0], -into[1]];
  else {
    // Straight on, or the route's end: square to the course, the upper side.
    const along = ahead ?? back ?? [1, 0];
    out = [along[1], -along[0]];
    if (out[1] > 0 || (out[1] === 0 && out[0] < 0)) out = [-out[0], -out[1]];
  }
  const deg = (Math.atan2(out[0], -out[1]) * 180) / Math.PI;
  return Math.round((deg + 360) % 360);
}

/** Ems of the name's 11 points from the point to the pill's words: clear
 *  of the 12-point dot and the pill's own edge round its words. */
const NEAR = 1.4;
const DIAGONAL = 1.1;

/** Eight sides, clockwise from up: the name's anchor (its side facing the
 *  point) and its offset. */
const SIDES: [string, [number, number]][] = [
  ["bottom", [0, -NEAR]],
  ["bottom-left", [DIAGONAL, -DIAGONAL]],
  ["left", [NEAR, 0]],
  ["top-left", [DIAGONAL, DIAGONAL]],
  ["top", [0, NEAR]],
  ["top-right", [-DIAGONAL, DIAGONAL]],
  ["right", [-NEAR, 0]],
  ["bottom-right", [-DIAGONAL, -DIAGONAL]],
];

/** The name's anchor and offset for a map turned `bearing` degrees: the
 *  feature's `out` (outsideOfTurn) less the bearing, to the nearest of
 *  eight sides. */
export function turnSide(bearing: number): Pick<Layout, "text-anchor" | "text-offset"> {
  const turned = ["%", ["+", ["get", "out"], 720 - Math.round(bearing)], 360];
  const sector = ["%", ["round", ["/", turned, 45]], 8];
  const pick = (of: (s: [string, [number, number]]) => unknown) =>
    ["match", sector, ...SIDES.flatMap((s, i) => [i, of(s)]), of(SIDES[0]!)] as ExpressionSpecification;
  return {
    "text-anchor": pick(([a]) => a) as Layout["text-anchor"],
    "text-offset": pick(([, o]) => ["literal", o]) as Layout["text-offset"],
  };
}
