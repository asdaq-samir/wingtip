import { M_PER_FT, M_PER_NM } from "../../../../lib/geo";
import { WORLD_WIDTH_M, latOf, mercX, mercY } from "../../../../lib/map/tileMath";
import type { AloftPoint } from "./geometry";

/**
 * The ground near the route against the plan, for the 3D map
 * (ClearanceGl): a terrain tile's heights made heights over the planned
 * altitude of the nearest leg, within the engine's corridor either side of
 * the course (`floor_corridor_nm`, the VFR floor's), and nothing outside
 * it. Drawn by a color-relief layer with the pilot's-eye view's own
 * colours (svColours) against an altitude of 0: amber within the engine's
 * band below the plan, red at and above it. Pure, so it is tested without
 * a map.
 *
 * Worked on the Web Mercator plane the tiles are cut in: it keeps angles,
 * so a distance there is a distance on the ground, scaled by the cosine of
 * the latitude, at the few miles a corridor is across.
 */

/** A height no ground has, m: the tile's pixels outside the corridor,
 *  which the colours leave clear. */
export const OUTSIDE_M = -10000;
/** How finely the course is kept, nm: a straight piece of a great circle
 *  this short is within metres of it. */
const STEP_NM = 1;

/** A piece of the course on the Mercator plane (0 to 1 each way), and the
 *  planned altitude of its leg, m MSL. */
export interface CoursePiece {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  altM: number;
}

/** The route's points as pieces of course, a point kept every STEP_NM and
 *  wherever the leg changes, each piece at the altitude of the leg it
 *  ends on (useRouteAloft's legFt, else the point's own). */
export function coursePieces(points: AloftPoint[]): CoursePiece[] {
  const legAt = (p: AloftPoint) => p.legFt ?? p.altFt;
  const kept: AloftPoint[] = points.slice(0, 1);
  let since = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!,
      q = points[i - 1]!;
    since += Math.hypot(p.lat - q.lat, (p.lon - q.lon) * Math.cos((p.lat * Math.PI) / 180)) * 60;
    if (legAt(p) !== legAt(q)) {
      // A leg's change kept at both ends: the point before it ends the
      // leg before, this one starts the next.
      if (kept.at(-1) !== q) kept.push(q);
      kept.push(p);
      since = 0;
    } else if (since >= STEP_NM || i === points.length - 1) {
      kept.push(p);
      since = 0;
    }
  }
  const pieces: CoursePiece[] = [];
  for (let i = 1; i < kept.length; i++) {
    const a = kept[i - 1]!,
      b = kept[i]!;
    pieces.push({ ax: mercX(a.lon), ay: mercY(a.lat), bx: mercX(b.lon), by: mercY(b.lat), altM: (b.legFt ?? b.altFt) * M_PER_FT });
  }
  return pieces;
}

/** The route's box with the corridor round it, as a source's `bounds`
 *  (west, south, east, north): no tile is asked for past it. */
export function corridorBounds(points: AloftPoint[], corridorNm: number): [number, number, number, number] {
  const lats = points.map((p) => p.lat),
    lons = points.map((p) => p.lon);
  const north = Math.max(...lats),
    south = Math.min(...lats);
  const dLat = corridorNm / 60,
    dLon = corridorNm / (60 * Math.cos((Math.max(Math.abs(north), Math.abs(south)) * Math.PI) / 180));
  return [Math.min(...lons) - dLon, Math.max(south - dLat, -85), Math.max(...lons) + dLon, Math.min(north + dLat, 85)];
}

/** The pieces of course whose corridor may reach the tile: their boxes
 *  against its own, the corridor at the tile's edge nearer the pole, the
 *  widest it is on the plane over the tile. */
export function piecesNear(tile: { z: number; x: number; y: number }, pieces: CoursePiece[], corridorNm: number): CoursePiece[] {
  const span = 1 / 2 ** tile.z,
    west = tile.x * span,
    north = tile.y * span;
  const poleLat = Math.max(Math.abs(latOf(north)), Math.abs(latOf(north + span)));
  const reach = (corridorNm * M_PER_NM) / (WORLD_WIDTH_M * Math.cos((poleLat * Math.PI) / 180));
  return pieces.filter(
    (p) =>
      Math.max(p.ax, p.bx) >= west - reach &&
      Math.min(p.ax, p.bx) <= west + span + reach &&
      Math.max(p.ay, p.by) >= north - reach &&
      Math.min(p.ay, p.by) <= north + span + reach,
  );
}

/**
 * A tile's ground, `heights` (m, row by row from its north-west corner,
 * `size` a side), as heights over the planned altitude of the nearest
 * piece of course within `corridorNm` of each pixel, and OUTSIDE_M past
 * it. Only the pieces near the tile are measured.
 */
export function heightsOverPlan(
  heights: Float32Array,
  size: number,
  tile: { z: number; x: number; y: number },
  pieces: CoursePiece[],
  corridorNm: number,
): Float32Array {
  const out = new Float32Array(size * size).fill(OUTSIDE_M);
  const near = piecesNear(tile, pieces, corridorNm);
  if (!near.length) return out;
  const span = 1 / 2 ** tile.z,
    west = tile.x * span,
    north = tile.y * span;
  for (let row = 0; row < size; row++) {
    const py = north + ((row + 0.5) / size) * span;
    const r = (corridorNm * M_PER_NM) / (WORLD_WIDTH_M * Math.cos((latOf(py) * Math.PI) / 180));
    const r2 = r * r;
    for (let col = 0; col < size; col++) {
      const px = west + ((col + 0.5) / size) * span;
      let best = r2,
        altM = NaN;
      for (const p of near) {
        const dx = p.bx - p.ax,
          dy = p.by - p.ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - p.ax) * dx + (py - p.ay) * dy) / len2)) : 0;
        const ex = p.ax + t * dx - px,
          ey = p.ay + t * dy - py;
        const d2 = ex * ex + ey * ey;
        if (d2 <= best) {
          best = d2;
          altM = p.altM;
        }
      }
      const i = row * size + col;
      if (!Number.isNaN(altM)) out[i] = heights[i]! - altM;
    }
  }
  return out;
}

/** A terrarium tile's RGBA pixels as heights, m (height = R * 256 + G +
 *  B / 256 - 32768, Mapzen's encoding, MapLibre's `terrarium`). */
export function terrariumHeights(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4]! * 256 + rgba[i * 4 + 1]! + rgba[i * 4 + 2]! / 256 - 32768;
  return out;
}

/** Heights, m, written in the terrarium encoding as opaque RGBA pixels. */
export function terrariumPixels(heights: Float32Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(heights.length * 4);
  for (let i = 0; i < heights.length; i++) {
    const v = Math.min(65535.99, Math.max(0, heights[i]! + 32768));
    const whole = Math.floor(v);
    out[i * 4] = whole >> 8;
    out[i * 4 + 1] = whole & 255;
    out[i * 4 + 2] = Math.floor((v - whole) * 256);
    out[i * 4 + 3] = 255;
  }
  return out;
}
