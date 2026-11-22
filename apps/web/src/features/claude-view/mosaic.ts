import { fitZoom, tileFraction, TILE_PX } from "../../lib/map/tileMath";
import type { FlightView } from "./flightView";

/** The chart's zooms the still picture uses: the sectional's own pyramid
 *  starts at 5, and past 11 a long route's picture is mostly one field. */
const ZOOMS = { min: 5, max: 11 };
/** Room round the route, px, so its ends' marks are not cut by the edge. */
const PAD = 28;

export interface Mosaic {
  zoom: number;
  tiles: { x: number; y: number; left: number; top: number }[];
  /** The route's line and points in the picture's pixels. */
  line: string;
  points: { left: number; top: number }[];
}

/**
 * The chart's tiles that frame the route in a `width` by `height` box,
 * where each falls, and the route's line and points over them: a still
 * picture drawn with images and SVG, as the view's sandbox runs neither
 * MapLibre's worker nor WebGL's shaders reliably. The projection is
 * tileMath's, the one the map and the chart's pyramid are cut by.
 */
export function mosaicOf(view: FlightView, width: number, height: number): Mosaic {
  const placed = [...view.points.map((p) => ({ lat: p.lat, lon: p.lon })), ...view.line.map(([lat, lon]) => ({ lat, lon }))];
  const maxZoom = Math.min(ZOOMS.max, view.chart.max_zoom ?? ZOOMS.max);
  const zoom = fitZoom(placed, width, height, PAD, Math.max(ZOOMS.min, view.chart.min_zoom ?? ZOOMS.min), maxZoom);
  const at = placed.map((p) => tileFraction(p.lat, p.lon, zoom));
  const xs = at.map((p) => p.x);
  const ys = at.map((p) => p.y);
  // The picture's top left, in tiles, with the route's box at its middle.
  const left = (Math.min(...xs) + Math.max(...xs)) / 2 - width / 2 / TILE_PX;
  const top = (Math.min(...ys) + Math.max(...ys)) / 2 - height / 2 / TILE_PX;
  const px = (p: { x: number; y: number }) => ({ left: (p.x - left) * TILE_PX, top: (p.y - top) * TILE_PX });
  const tiles = [];
  for (let y = Math.floor(top); y < top + height / TILE_PX; y++) {
    for (let x = Math.floor(left); x < left + width / TILE_PX; x++) {
      tiles.push({ x, y, left: (x - left) * TILE_PX, top: (y - top) * TILE_PX });
    }
  }
  const drawn = (view.line.length ? view.line.map(([lat, lon]) => ({ lat, lon })) : view.points).map((p) =>
    px(tileFraction(p.lat, p.lon, zoom)),
  );
  return {
    zoom,
    tiles,
    line: drawn.map((p) => `${p.left.toFixed(1)},${p.top.toFixed(1)}`).join(" "),
    points: view.points.map((p) => px(tileFraction(p.lat, p.lon, zoom))),
  };
}
