import { M_PER_FT } from "./geometry";

/**
 * How high the 3D map stands an airspace volume (AirspaceVolumesGl): its
 * floor and ceiling as the FAA gives them, MSL or above the ground, as
 * metres above mean sea level, which is what deck.gl draws a polygon's
 * height in. Pure, so it is tested without a map.
 *
 * deck.gl stands an extruded polygon at the heights it is given, over
 * the sea, and the 3D ground (MapLibre's terrain, at its own height:
 * dem.ts's EXAGGERATION 1) hides what is under it. So an MSL figure is
 * drawn as it is, and the ground matters only to a figure above it (AGL,
 * or SFC with a figure): that is drawn over the ground under the volume,
 * read once from the terrain at points round its outline (groundSpan), the lowest of
 * it for a floor and the highest for a ceiling, so a volume drawn flat
 * over hills is never drawn smaller than it is.
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

/** Where a volume with no top, or one above it, is drawn to, feet MSL:
 *  the floor of Class A (14 CFR 71.33), the top of the airspace a VFR
 *  pilot flies in and of what the 3D view draws (the card writes the
 *  FAA's own figure, FL450 or unlimited). A drawing bound, not a rule:
 *  Class A itself is never drawn. */
export const UNLIMITED_DRAWN_TO_FT = 18_000;

/** Whether a height is above the ground rather than the sea: AGL, and
 *  SFC with a figure -- the FAA's special use airspace service codes
 *  Brady Low MOA's 500 ft AGL floor SFC with 500 (wingtip.sua._height_ft). */
const aboveGround = (ft: number | null, ref: HeightRef) => {
  const r = (ref ?? "MSL").toUpperCase();
  return r === "AGL" || (r === "SFC" && !!ft);
};

/** Whether a volume needs the ground under it to be drawn. */
export const needsGround = (v: VolumeHeights) => aboveGround(v.floorFt, v.floorRef) || aboveGround(v.ceilingFt, v.ceilingRef);

/** The ground under a volume, metres MSL: its lowest and its highest. */
export interface GroundSpan {
  low: number;
  high: number;
}

/** Metres MSL of a height `ft` referred to `ref`, over `groundM`. MSL,
 *  and a flight level (STD, its pressure altitude drawn as if MSL), is
 *  above the sea; AGL and SFC with a figure above the ground; SFC with
 *  none, the ground itself, drawn from the sea up and hidden under it. */
export function altitudeM(ft: number, ref: HeightRef, groundM: number): number {
  return aboveGround(ft, ref) ? groundM + ft * M_PER_FT : ft * M_PER_FT;
}

/** The volume's floor and ceiling in metres MSL, the ceiling no higher
 *  than UNLIMITED_DRAWN_TO_FT; null where nothing is left to draw (the
 *  floor at or over the top), or where it needs the ground and the
 *  terrain has none in yet (`ground` null). */
export function volumeSpan(v: VolumeHeights, ground: GroundSpan | null): { floorM: number; ceilingM: number } | null {
  if (needsGround(v) && !ground) return null;
  const floorM = altitudeM(v.floorFt ?? 0, v.floorRef, ground?.low ?? 0);
  const top = UNLIMITED_DRAWN_TO_FT * M_PER_FT;
  const ceilingM = v.ceilingFt == null ? top : Math.min(top, altitudeM(v.ceilingFt, v.ceilingRef, ground?.high ?? 0));
  return ceilingM > floorM ? { floorM, ceilingM } : null;
}

/** The ground's lowest and highest at the points, metres; null where the
 *  terrain has none of them in yet (a point off its loaded tiles reads
 *  null, MapLibre's queryTerrainElevation). */
export function groundSpan(points: number[][], ground: (at: [number, number]) => number | null): GroundSpan | null {
  let low = Infinity,
    high = -Infinity;
  for (const p of points) {
    const g = ground([p[0]!, p[1]!]);
    if (g == null) continue;
    low = Math.min(low, g);
    high = Math.max(high, g);
  }
  return low <= high ? { low, high } : null;
}
