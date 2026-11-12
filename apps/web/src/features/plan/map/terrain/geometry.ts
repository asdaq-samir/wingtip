import { distanceNm, rad } from "../../../../lib/geo";

/**
 * The shapes the 3D map stands up over its ground (TerrainGl): the route
 * at its planned altitudes and the obstacles. Pure, so they are tested
 * without a map.
 *
 * MapLibre draws no line in the air: a fill-extrusion is the one shape it
 * lifts, and over 3D ground it stands each polygon on the ground at the
 * polygon's centroid (its fill-extrusion shader's `a_centroid`), its
 * `base` and `height` metres above that. So the route aloft is a chain of
 * short, thin polygons, each lifted by its altitude less the ground at its
 * middle; the obstacles, small squares as tall as the FAA says they are.
 */

/** A point of the planned flight: where, and the plan's altitude there, ft MSL. */
export interface AloftPoint {
  lat: number;
  lon: number;
  altFt: number;
  /** The planned altitude of the leg it is on, ft MSL: the nav log's, which
   *  the ground near the route is coloured against (ClearanceGl). */
  legFt?: number;
}

/** International feet in a metre's place: 0.3048 m a foot. */
export const M_PER_FT = 0.3048;
const M_PER_NM = 1852;

/** How finely the route aloft is cut: each piece's ground is the ground
 *  at its middle, so a short piece follows the hills under it. */
const ALOFT_STEP_NM = 0.5;

/** The flight's line at even steps along it, each point's altitude in
 *  proportion between the plan's points either side. */
export function resampleAloft(points: AloftPoint[], stepNm = ALOFT_STEP_NM): AloftPoint[] {
  if (points.length < 2) return points;
  const out: AloftPoint[] = [points[0]!];
  let carried = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    const leg = distanceNm(a, b);
    if (leg <= 0) continue;
    let along = stepNm - carried;
    while (along < leg) {
      const f = along / leg;
      out.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, altFt: a.altFt + (b.altFt - a.altFt) * f });
      along += stepNm;
    }
    carried = leg - (along - stepNm);
  }
  const last = points.at(-1)!;
  if (out.at(-1) !== last) out.push(last);
  return out;
}

/** A quadrilateral `widthM` wide round the line from `a` to `b`, as a
 *  GeoJSON ring (lon, lat), on the local flat earth a piece this short is. */
function band(a: AloftPoint, b: AloftPoint, widthM: number): [number, number][] {
  const mPerDegLat = 60 * M_PER_NM;
  const mPerDegLon = mPerDegLat * Math.cos(rad((a.lat + b.lat) / 2));
  const dx = (b.lon - a.lon) * mPerDegLon,
    dy = (b.lat - a.lat) * mPerDegLat;
  const len = Math.hypot(dx, dy) || 1;
  // Half the width, across the line.
  const ox = (-dy / len) * (widthM / 2),
    oy = (dx / len) * (widthM / 2);
  const off = (p: AloftPoint, s: number): [number, number] => [p.lon + (s * ox) / mPerDegLon, p.lat + (s * oy) / mPerDegLat];
  return [off(a, 1), off(b, 1), off(b, -1), off(a, -1), off(a, 1)];
}

/** One piece of the route aloft: its altitude at its middle, metres MSL,
 *  and its middle, where its ground is read. */
interface AloftPiece {
  altM: number;
  mid: [lon: number, lat: number];
  ring: [number, number][];
}

/** The route aloft cut into pieces `widthM` wide (resampleAloft's steps,
 *  `stepNm` apart: finer for a ring a mile or two round). */
export function aloftPieces(points: AloftPoint[], widthM: number, stepNm = ALOFT_STEP_NM): AloftPiece[] {
  const line = resampleAloft(points, stepNm);
  const pieces: AloftPiece[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!,
      b = line[i]!;
    if (a.lat === b.lat && a.lon === b.lon) continue;
    pieces.push({ altM: ((a.altFt + b.altFt) / 2) * M_PER_FT, mid: [(a.lon + b.lon) / 2, (a.lat + b.lat) / 2], ring: band(a, b, widthM) });
  }
  return pieces;
}

/**
 * The pieces as fill-extrusion features: `top`, the piece's altitude above
 * the ground MapLibre will stand it on (`groundM`, the ground at its
 * middle, null on a flat map, where the extrusion stands on the sea); and
 * `bottom`, `thickM` under it -- or the ground itself, 0, for the curtain
 * down to the ground track.
 */
export function aloftFeatures(
  pieces: AloftPiece[],
  groundM: (mid: [number, number]) => number | null,
  thickM: number | null,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pieces.map((p) => {
      const top = Math.max(0, p.altM - (groundM(p.mid) ?? 0));
      return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [p.ring] },
        properties: { top, bottom: thickM === null ? 0 : Math.max(0, top - thickM) },
      };
    }),
  };
}

/** The FAA's obstacles as squares `sideM` across, as tall as the Digital
 *  Obstacle File says (agl_ft, above the ground they stand on). */
export function obstacleFeatures(
  obstacles: { lat: number; lon: number; agl_ft: number; amsl_ft: number; type: string; lit: boolean }[],
  sideM: number,
): GeoJSON.FeatureCollection {
  const half = sideM / 2;
  return {
    type: "FeatureCollection",
    features: obstacles.map((o) => {
      const dLat = half / (60 * M_PER_NM),
        dLon = half / (60 * M_PER_NM * Math.cos(rad(o.lat)));
      return {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [o.lon - dLon, o.lat - dLat],
              [o.lon + dLon, o.lat - dLat],
              [o.lon + dLon, o.lat + dLat],
              [o.lon - dLon, o.lat + dLat],
              [o.lon - dLon, o.lat - dLat],
            ],
          ],
        },
        properties: { height: o.agl_ft * M_PER_FT, agl: o.agl_ft, amsl: o.amsl_ft, type: o.type, lit: o.lit },
      };
    }),
  };
}
