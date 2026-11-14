import { callEngine } from "../../../../lib/engine/engine";
import { M_PER_FT } from "../../../../lib/geo";

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
 * the sea, and the 3D ground (MapLibre's terrain, stood up by the 3D
 * view's Heights, which piecesOf undoes for the ground and does to the
 * volume) hides what is under it. The ground
 * under a volume is read from the terrain at points round its outline
 * (groundSpan), its lowest and its highest, and a volume is drawn on the
 * last reading taken with every point's tile in (keptGround).
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

/** A volume as drawn: floor and ceiling in metres MSL, the floor in feet
 *  too (what it is shaded by, airspaceShelves), whether the floor is the
 *  surface, and whether it holds any of a plan's altitudes (null with no
 *  plan). */
export interface DrawnSpan {
  floorM: number;
  ceilingM: number;
  floorFt: number;
  surface: boolean;
  holds: boolean | null;
}

/** The volume's span (DrawnSpan); null where nothing is left to draw, or
 *  where it needs the ground and the terrain has none in yet (`ground`
 *  null). With `altitudes` (ft MSL, the plan's), whether it holds any of
 *  them is the engine's too (its `holds`). */
export function volumeSpan(v: VolumeHeights, ground: GroundSpan | null, altitudes: number[] | null = null): DrawnSpan | null {
  const span = callEngine("airspace_volume_span", {
    floor: v.floor,
    ceiling: v.ceiling,
    ground: ground && { low_ft: ground.low / M_PER_FT, high_ft: ground.high / M_PER_FT },
    altitudes_ft: altitudes,
  });
  return (
    span && {
      floorM: span.floor_ft * M_PER_FT,
      ceilingM: span.ceiling_ft * M_PER_FT,
      floorFt: span.floor_ft,
      surface: span.surface,
      holds: span.holds ?? null,
    }
  );
}

/** The terrain at a point (groundReader): its height in metres, "loading"
 *  where its tile's own heights are still to come, or null where none
 *  will (off the source's bounds, or its tile not asked for). */
export type GroundPoint = number | "loading" | null;

/** The ground read under a volume's outline: its lowest and highest over
 *  the points read (null where none was), and whether it is settled, no
 *  point of it waiting for its tile. */
export interface GroundReading {
  span: GroundSpan | null;
  settled: boolean;
}

/** The ground's lowest and highest at the points, metres (GroundReading). */
export function groundSpan(points: number[][], ground: (at: [number, number]) => GroundPoint): GroundReading {
  let low = Infinity,
    high = -Infinity,
    settled = true;
  for (const p of points) {
    const g = ground([p[0]!, p[1]!]);
    if (g === "loading") settled = false;
    if (typeof g !== "number") continue;
    low = Math.min(low, g);
    high = Math.max(high, g);
  }
  return { span: low <= high ? { low, high } : null, settled };
}

/** The ground a volume is drawn on, given the one it was last drawn on
 *  (`was`) and a fresh reading: the fresh one only once it is settled,
 *  every point of the outline read from its own loaded tile. Meanwhile
 *  the last is kept, so a volume is never drawn lower, or dropped, while
 *  the terrain under it comes in after a pan -- the flicker the owner saw
 *  on 2026-11-14, when a point still loading read as the sea (MapLibre's
 *  queryTerrainElevation gives 0 there). With none kept, a volume above
 *  the ground waits for a settled reading. */
export function keptGround(was: GroundSpan | null, now: GroundReading): GroundSpan | null {
  return now.settled && now.span ? now.span : was;
}
