import { rad } from "../../../../lib/geo";
import { extrusionHeights, type VolumeHeights } from "./airspaceHeights";

/**
 * The crisp edges of the 3D airspace (AirspaceVolumesGl): a thin rail
 * along each volume's top edge, and along its floor where the floor is
 * off the ground, so a see-through volume reads as a shape and not a
 * wash. MapLibre draws no line in the air (a line lies on the ground), so
 * a rail is a fill-extrusion too: a narrow band along the ring, lifted
 * from just under the ceiling to the ceiling. Pure, so it is tested
 * without a map.
 *
 * The rings come from the tiles as MapLibre cut them, and a tile's cut
 * runs straight along a meridian or a parallel at its buffer's edge: no
 * edge of the volume, so those pieces of a ring get no rail (edgeRuns).
 */

const M_PER_DEG_LAT = 60 * 1852;
/** Closer than this, two coordinates are on the same meridian or parallel
 *  (the tiles' 4096 units a tile, many times finer than this). */
const SAME = 1e-9;

/** A ring's runs of edge with the tile's cuts taken out: each a polyline
 *  of (lon, lat) points. A cut is straight along a meridian or a parallel
 *  at the edge of the piece's own bounds (the tile's buffer); a step of a
 *  curve the tile's grid made straight is inside them, and kept. A ring
 *  with no cut is one run, closed. */
export function edgeRuns(ring: number[][]): number[][][] {
  const lons = ring.map((p) => p[0]!),
    lats = ring.map((p) => p[1]!);
  const onBound = (v: number, all: number[]) => Math.abs(v - Math.min(...all)) < SAME || Math.abs(v - Math.max(...all)) < SAME;
  const runs: number[][][] = [];
  let run: number[][] = [];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1]!,
      b = ring[i]!;
    const cut = (Math.abs(a[0]! - b[0]!) < SAME && onBound(a[0]!, lons)) || (Math.abs(a[1]! - b[1]!) < SAME && onBound(a[1]!, lats));
    if (cut) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    if (!run.length) run.push(a);
    run.push(b);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/** A band `widthM` wide round a polyline, as a closed GeoJSON ring: each
 *  point moved half the width either side along the mean of its two
 *  edges' normals, on the local flat earth a rail this narrow is. */
export function bandRing(line: number[][], widthM: number): number[][] {
  const lat0 = line.reduce((s, p) => s + p[1]!, 0) / line.length;
  const mx = M_PER_DEG_LAT * Math.cos(rad(lat0));
  const xy = line.map((p) => [p[0]! * mx, p[1]! * M_PER_DEG_LAT] as const);
  const normal = (i: number, j: number) => {
    const dx = xy[j]![0] - xy[i]![0],
      dy = xy[j]![1] - xy[i]![1];
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len] as const;
  };
  const half = widthM / 2;
  const left: number[][] = [],
    right: number[][] = [];
  for (let i = 0; i < xy.length; i++) {
    const n1 = i > 0 ? normal(i - 1, i) : normal(i, i + 1);
    const n2 = i < xy.length - 1 ? normal(i, i + 1) : n1;
    let nx = n1[0] + n2[0],
      ny = n1[1] + n2[1];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const [x, y] = xy[i]!;
    left.push([(x + nx * half) / mx, (y + ny * half) / M_PER_DEG_LAT]);
    right.push([(x - nx * half) / mx, (y - ny * half) / M_PER_DEG_LAT]);
  }
  const ring = [...left, ...right.reverse()];
  ring.push(ring[0]!);
  return ring;
}

/** One volume's piece to give rails: its rings, its heights, its ink. */
export interface RailPiece {
  rings: number[][][];
  heights: VolumeHeights;
  ink: string;
}

/** The rails of the pieces as fill-extrusion features (`base`, `height`
 *  and `ink`), `widthM` wide and as deep: each run's ground the ground at
 *  its middle, where MapLibre stands the band (the mean of its vertices,
 *  which a band's two sides keep). */
export function railFeatures(
  pieces: RailPiece[],
  widthM: number,
  ground: (at: [number, number]) => number | null,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const piece of pieces) {
    for (const ring of piece.rings) {
      for (const run of edgeRuns(ring)) {
        const mid: [number, number] = [run.reduce((s, p) => s + p[0]!, 0) / run.length, run.reduce((s, p) => s + p[1]!, 0) / run.length];
        const g = ground(mid);
        const h = g == null ? null : extrusionHeights(piece.heights, g);
        if (!h) continue;
        const geometry: GeoJSON.Polygon = { type: "Polygon", coordinates: [bandRing(run, widthM)] };
        const rail = (base: number, height: number) =>
          features.push({ type: "Feature", geometry, properties: { base: Math.max(0, base), height, ink: piece.ink } });
        rail(h.height - widthM, h.height);
        // The floor's rail where it is off the ground: on the ground the
        // chart's own line is the edge.
        if (h.base > 0) rail(h.base, Math.min(h.height, h.base + widthM));
      }
    }
  }
  return { type: "FeatureCollection", features };
}

/** Metres a screen pixel spans at a latitude and MapLibre zoom (512 px
 *  tiles over the Web Mercator earth's 40,075,016.686 m equator). */
export const metresPerPixel = (lat: number, zoom: number) => (40_075_016.686 * Math.cos(rad(lat))) / (512 * 2 ** zoom);
