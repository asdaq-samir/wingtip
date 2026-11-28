/**
 * The slippy-map tile scheme's one formula, the Web Mercator projection
 * (EPSG:3857) the map, the chart's pyramid and the overlay archive are
 * all cut by: where a point falls on it, and in tiles at a zoom. It was
 * written four ways, some clamping the latitude and some not. No MapLibre here: Keep for the Air reaches this from
 * the page's first script (issue #87).
 *
 * Written out rather than taken from @mapbox/tilebelt (MIT, 2.0.3): its
 * pointToTileFraction does not clamp the latitude (-Infinity at a pole)
 * and wraps x, where a box's range wants it as it is; four lines of our
 * own read plainer than a wrapper round it.
 */

/** Web Mercator's edge: the latitude at which the projected square's top
 *  falls, arctan(sinh(π)). */
const MAX_LATITUDE = 85.0511287798;

/** The equator's length, m: the Web Mercator world's width (EPSG:3857, the
 *  sphere of 6,378,137 m). The web's one place for the earth's size;
 *  MapLibre's MercatorCoordinate is not used for it because it takes the
 *  mean radius (6,371,008.8 m), a tenth of a percent short of the tiles'. */
const WORLD_WIDTH_M = 40075016.686;

/** The Web Mercator world's width on the ground at `lat`, m: the equator's
 *  shrunk by the parallel's cosine, so a share of the world's width times
 *  this is that many metres east and west there. Its own cosine, not
 *  lib/geo's lonScale, so this file stays free of the engine's module
 *  (Keep for the Air reaches it from the page's first script). */
export const worldMetresAt = (lat: number) => WORLD_WIDTH_M * Math.cos((lat * Math.PI) / 180);

/** Ground metres a screen point covers at `lat` and MapLibre's `zoom`: its
 *  camera's world is 512 points wide at zoom 0 (its tileSize), not the
 *  raster tiles' 256. */
export const metresPerPoint = (lat: number, zoom: number) => worldMetresAt(lat) / (512 * 2 ** zoom);

/** Where a longitude falls across the Web Mercator world, 0 at 180 W to 1
 *  at 180 E. */
export const mercX = (lon: number) => (lon + 180) / 360;

/** Where a latitude falls down the Web Mercator world, 0 at its top edge
 *  to 1 at its bottom; the latitude clamped to the projection's edge. */
export function mercY(lat: number): number {
  const phi = (Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)) * Math.PI) / 180;
  return (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2;
}

/** The longitude at `x` across the Web Mercator world (mercX's inverse). */
export const lonOf = (x: number) => x * 360 - 180;

/** The latitude at `y` down the Web Mercator world (mercY's inverse). */
export const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/** Where a point falls in the tile grid at zoom `z`, in tiles and
 *  fractions of one, (0, 0) the top left of the world; the latitude
 *  clamped to the projection's edge. */
export function tileFraction(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  return { x: mercX(lon) * n, y: mercY(lat) * n };
}

/** The tile a point is in at zoom `z`. */
export function tileOf(lat: number, lon: number, z: number): { x: number; y: number } {
  const { x, y } = tileFraction(lat, lon, z);
  return { x: Math.floor(x), y: Math.floor(y) };
}

/** The tile pixels a slippy map's tile is drawn at (the chart's 256). */
export const TILE_PX = 256;

/** The highest whole zoom, between `min` and `max`, at which the points
 *  all fit a `width` by `height` pixel box with `pad` pixels round them:
 *  a still picture of the chart framing a route (the connector's live
 *  view, which draws its tiles with no map library). */
export function fitZoom(
  points: { lat: number; lon: number }[],
  width: number,
  height: number,
  pad: number,
  min: number,
  max: number,
): number {
  if (points.length === 0) return min;
  const xs = points.map((p) => mercX(p.lon));
  const ys = points.map((p) => mercY(p.lat));
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const across = Math.max(1, width - 2 * pad) / TILE_PX;
  const down = Math.max(1, height - 2 * pad) / TILE_PX;
  const fits = Math.floor(Math.log2(Math.min(spanX > 0 ? across / spanX : Infinity, spanY > 0 ? down / spanY : Infinity)));
  return Math.max(min, Math.min(max, Number.isFinite(fits) ? fits : max));
}
