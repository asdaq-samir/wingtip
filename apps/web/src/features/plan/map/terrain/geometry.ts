import { rad } from "../../../../lib/geo";

/**
 * The shapes the 3D map stands up over its ground (TerrainGl): the route
 * at its planned altitudes and the obstacles. Pure, so they are tested
 * without a map.
 *
 * The route in the air is deck.gl's (AloftGl, ApproachGl): a line and
 * walls at metres above the sea, as the plan's altitudes are, which the
 * 3D ground hides the foot of. The obstacles are MapLibre's own
 * fill-extrusions, small squares as tall above the ground as the FAA
 * says: MapLibre stands one on the ground at its middle, which for a
 * square round the obstacle is the obstacle's own point.
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

/** The flight's line in the air as deck.gl takes it: [lon, lat, metres
 *  MSL] a point, the plan's altitude there. */
export const aloftPath = (points: AloftPoint[]): number[][] => points.map((p) => [p.lon, p.lat, p.altFt * M_PER_FT]);

/** The curtain under the line: one upright wall a leg, from the sea up to
 *  the line's altitudes at its two ends, drawn as deck.gl's polygons in
 *  3D (SolidPolygonLayer's _full3d; the four corners of a wall are in one
 *  upright plane, so it is flat). The 3D ground hides its foot, so it
 *  reaches down to the ground track wherever the ground is. */
export function curtainWalls(points: AloftPoint[]): number[][][] {
  const walls: number[][][] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    if (a.lat === b.lat && a.lon === b.lon) continue;
    walls.push([
      [a.lon, a.lat, 0],
      [b.lon, b.lat, 0],
      [b.lon, b.lat, b.altFt * M_PER_FT],
      [a.lon, a.lat, a.altFt * M_PER_FT],
      [a.lon, a.lat, 0],
    ]);
  }
  return walls;
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
