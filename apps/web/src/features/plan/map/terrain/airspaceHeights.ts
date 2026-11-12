import { M_PER_FT } from "./geometry";

/**
 * How high the 3D map stands an airspace volume (AirspaceVolumesGl): its
 * floor and ceiling as the FAA gives them, MSL or above the ground, as the
 * `fill-extrusion-base` and `fill-extrusion-height` MapLibre wants. Pure,
 * so it is tested without a map.
 *
 * MapLibre measures an extrusion from the ground, not from the sea, once
 * the map has 3D terrain: its fill-extrusion vertex shader (maplibre-gl
 * src/shaders/glsl/fill_extrusion.vertex.glsl, TERRAIN3D) adds the
 * terrain's elevation at the polygon's centroid, `get_elevation(a_centroid)`,
 * to both the base and the height, after clamping each to 0 or more; and
 * a base of 0 is lowered 10 m more, a basement, so a building on a slope
 * does not hang. The centroid is the plain mean of the polygon's vertices,
 * its holes' too, as the tile cut it (FillExtrusionBucket.addFeature,
 * accumulatePointsToCentroid), one per polygon per tile. So:
 *
 * - a height above the ground (AGL, or SFC with a figure) is given as it
 *   is, metres: MapLibre puts it on the ground at the centroid;
 * - a height above the sea (MSL) is given less the ground at that
 *   centroid, read from the same terrain tiles the shader reads
 *   (queryTerrainElevation), so it lands at its true altitude there.
 *
 * The top is flat at that one ground, as an MSL ceiling is; one AGL is
 * flat too, at the ground under the centroid, not following the hills.
 */

/** How the FAA refers a height: above mean sea level, above the ground,
 *  the surface, or a flight level (STD, already in feet). */
export type HeightRef = string | null | undefined;

/** A volume's floor and ceiling as its data set has them, in feet. */
export interface VolumeHeights {
  /** The floor; 0 or null at the surface. */
  floorFt: number | null;
  floorRef: HeightRef;
  /** The top; null where the FAA gives none (UNL, unlimited). A "to but
   *  not including" top (UPPER_DESC TNI) is drawn at its figure. */
  ceilingFt: number | null;
  ceilingRef: HeightRef;
}

/** Where a volume with no top is drawn to, feet MSL: the floor of Class A
 *  (14 CFR 71.33), the top of the airspace a VFR pilot flies in and of
 *  what the 3D view draws (the card writes it unlimited, as the FAA does).
 *  A drawing bound, not a rule: Class A itself is never drawn. */
export const UNLIMITED_DRAWN_TO_FT = 18_000;

/** Metres above the ground MapLibre stands the polygon on (`groundM`, the
 *  terrain at its centroid) for a height of `ft` referred to `ref`. AGL,
 *  and SFC with a figure -- the FAA's special use airspace service codes
 *  Brady Low MOA's 500 ft AGL floor SFC with 500 (wingtip.sua._height_ft)
 *  -- is above the ground already; MSL, and a flight level (STD, its
 *  pressure altitude drawn as if MSL), is above the sea. */
export function aboveGroundM(ft: number, ref: HeightRef, groundM: number): number {
  const ref_ = (ref ?? "MSL").toUpperCase();
  if (ref_ === "AGL" || ref_ === "SFC") return ft * M_PER_FT;
  return ft * M_PER_FT - groundM;
}

/** The extrusion's base and height for a volume over `groundM`, or null
 *  where nothing is left above the ground to draw (a volume under the
 *  ground there, or one whose floor is at or over the drawn top). */
export function extrusionHeights(v: VolumeHeights, groundM: number): { base: number; height: number } | null {
  const base = Math.max(0, aboveGroundM(v.floorFt ?? 0, v.floorRef, groundM));
  const height =
    v.ceilingFt == null ? aboveGroundM(UNLIMITED_DRAWN_TO_FT, "MSL", groundM) : aboveGroundM(v.ceilingFt, v.ceilingRef, groundM);
  return height > base ? { base, height } : null;
}

type Position = number[];
type Polygonal = { type: "Polygon"; coordinates: Position[][] } | { type: "MultiPolygon"; coordinates: Position[][][] };

/** Each polygon's centroid as MapLibre's extrusion bucket takes it: the
 *  mean of every vertex of its rings, a ring's closing vertex left out. */
export function vertexCentroids(geometry: Polygonal | { type: string }): [number, number][] {
  const polygons =
    geometry.type === "Polygon"
      ? [(geometry as Extract<Polygonal, { type: "Polygon" }>).coordinates]
      : geometry.type === "MultiPolygon"
        ? (geometry as Extract<Polygonal, { type: "MultiPolygon" }>).coordinates
        : [];
  const out: [number, number][] = [];
  for (const rings of polygons) {
    let x = 0,
      y = 0,
      n = 0;
    for (const ring of rings) {
      ring.forEach((p, i) => {
        const first = ring[0]!;
        if (i === ring.length - 1 && p[0] === first[0] && p[1] === first[1]) return;
        x += p[0]!;
        y += p[1]!;
        n++;
      });
    }
    if (n) out.push([x / n, y / n]);
  }
  return out;
}

/** The ground a volume is lifted from, metres: the mean of the ground at
 *  each of its pieces' centroids (one a polygon a tile, so a volume over
 *  several tiles has several, which feature state cannot tell apart);
 *  null where the terrain has none (a flat map). */
export function meanGround(centroids: [number, number][], ground: (at: [number, number]) => number | null): number | null {
  let sum = 0,
    n = 0;
  for (const c of centroids) {
    const g = ground(c);
    if (g == null) continue;
    sum += g;
    n++;
  }
  return n ? sum / n : null;
}
