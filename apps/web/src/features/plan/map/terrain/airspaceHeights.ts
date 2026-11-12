import { callEngine } from "../../../../lib/engine/engine";
import { M_PER_FT } from "./geometry";

/**
 * How high the 3D map stands an airspace volume (AirspaceVolumesGl): its
 * floor and ceiling as metres above mean sea level, which is what deck.gl
 * draws a polygon's height in. The heights are the engine's
 * (`airspace_volume_span`, engine/crates/airspace/src/volume_span.rs):
 * the FAA's codes and descriptors read, a height above the ground stood
 * on the ground under the volume, the top drawn no higher than Class A's
 * floor. This only reads the ground and turns feet into metres.
 *
 * deck.gl stands an extruded polygon at the heights it is given, over
 * the sea, and the 3D ground (MapLibre's terrain, at its own height:
 * dem.ts's EXAGGERATION 1) hides what is under it. The ground
 * under a volume is read once from the terrain at points round its
 * outline (groundSpan), its lowest and its highest.
 */

/** A volume's limits as its data set has them: each its figure in feet
 *  (a flight level times 100), its code (SFC, AGL, MSL, STD, UNLTD) and
 *  its descriptor (TI, TNI, ANI). */
export interface VolumeHeights {
  floor: { ft: number | null; code: string | null; desc?: string | null };
  ceiling: { ft: number | null; code: string | null; desc?: string | null };
}

/** The ground under a volume, metres MSL: its lowest and its highest. */
export interface GroundSpan {
  low: number;
  high: number;
}

/** The volume's floor and ceiling in metres MSL, and whether its floor is
 *  the surface; null where nothing is left to draw, or where it needs the
 *  ground and the terrain has none in yet (`ground` null). */
export function volumeSpan(v: VolumeHeights, ground: GroundSpan | null): { floorM: number; ceilingM: number; surface: boolean } | null {
  const span = callEngine("airspace_volume_span", {
    floor: v.floor,
    ceiling: v.ceiling,
    ground: ground && { low_ft: ground.low / M_PER_FT, high_ft: ground.high / M_PER_FT },
  });
  return span && { floorM: span.floor_ft * M_PER_FT, ceilingM: span.ceiling_ft * M_PER_FT, surface: span.surface };
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
