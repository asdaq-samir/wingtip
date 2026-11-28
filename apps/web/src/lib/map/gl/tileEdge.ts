import type { Map as MlMap } from "maplibre-gl";
import { latOf, lonOf } from "../tileMath";

type Point = { x: number; y: number };

/** One tile's piece of a polygon as MapLibre's querySourceFeatures gives
 *  it: its rings in the tile's own units (0 to `extent` across, the
 *  buffer past either edge) and the tile it came from. */
export type TilePiece = { rings: Point[][]; extent: number; tile: { z: number; x: number; y: number } };

/** A segment clipped to the tile's square [0, extent] (Liang-Barsky), or
 *  null where none of it is inside. */
function clipped(a: Point, b: Point, extent: number): [Point, Point] | null {
  let t0 = 0,
    t1 = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x],
    [dx, extent - a.x],
    [-dy, a.y],
    [dy, extent - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  const at = (t: number) => ({ x: a.x + t * dx, y: a.y + t * dy });
  return [at(t0), at(t1)];
}

/** Whether a segment lies along the tile's edge: the clip's cut, not the
 *  polygon's own edge. */
const onEdge = ([a, b]: [Point, Point], extent: number) =>
  (a.x === b.x && (a.x === 0 || a.x === extent)) || (a.y === b.y && (a.y === 0 || a.y === extent));

/**
 * A polygon's own edge, as lines, from its pieces in the tiles drawn: each
 * ring cut to its tile's square, the cuts along the tile's edges left out,
 * so the pieces meet at the tiles' edges with no seam where the tiles
 * clipped it (their buffers overlap). For a thing picked whose edge is
 * drawn from a GeoJSON source of its own (AirspaceGl's lit volume), where a
 * filter on the tiles' own layer laid every tile of the source out again at
 * each pick.
 */
export function edgeOfPieces(pieces: TilePiece[]): GeoJSON.MultiLineString {
  const lines: [number, number][][] = [];
  for (const { rings, extent, tile } of pieces) {
    const size = 2 ** tile.z;
    const place = (p: Point): [number, number] => [lonOf((tile.x + p.x / extent) / size), latOf((tile.y + p.y / extent) / size)];
    for (const ring of rings) {
      let line: [number, number][] = [];
      const end = () => {
        if (line.length > 1) lines.push(line);
        line = [];
      };
      for (let i = 1; i < ring.length; i++) {
        const seg = clipped(ring[i - 1]!, ring[i]!, extent);
        if (!seg || onEdge(seg, extent) || (seg[0].x === seg[1].x && seg[0].y === seg[1].y)) {
          end();
          continue;
        }
        const last = line.at(-1);
        const start = place(seg[0]);
        if (!last || last[0] !== start[0] || last[1] !== start[1]) {
          end();
          line.push(start);
        }
        line.push(place(seg[1]));
      }
      end();
    }
  }
  return { type: "MultiLineString", coordinates: lines };
}

/** The tiles' pieces of volume `number` in `source`'s `airspace` layer
 *  loaded now, its edge as one feature (null where none is loaded) and the
 *  key of the tiles it was stitched from; "drawn" where they are the tiles
 *  of the edge drawn last (`last`), so a rest that finds the same pieces
 *  neither stitches nor sends the edge again (in flight the camera rests about once a second with a card open). */
export function litEdge(
  map: MlMap,
  source: string,
  number: string,
  last: string | null,
): { key: string; edge: GeoJSON.Feature | null } | "drawn" {
  // MapLibre's own: each feature in its tile's units, and that tile.
  type Raw = { _vectorTileFeature?: { loadGeometry(): TilePiece["rings"]; extent: number }; tile?: TilePiece["tile"] };
  const found = map.querySourceFeatures(source, { sourceLayer: "airspace", filter: ["==", ["to-string", ["get", "number"]], number] });
  const raws = (found as unknown as Raw[]).filter((f) => f._vectorTileFeature && f.tile);
  const key = raws
    .map((f) => `${f.tile!.z}/${f.tile!.x}/${f.tile!.y}`)
    .sort()
    .join();
  if (key === last) return "drawn";
  const pieces = raws.map((f) => ({ rings: f._vectorTileFeature!.loadGeometry(), extent: f._vectorTileFeature!.extent, tile: f.tile! }));
  return { key, edge: pieces.length ? { type: "Feature", properties: { number }, geometry: edgeOfPieces(pieces) } : null };
}
