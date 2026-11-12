/**
 * The slippy-map tile scheme's one formula, the Web Mercator projection
 * (EPSG:3857) the map, the chart's pyramid and the overlay archive are
 * all cut by: where a point falls on it, and in tiles at a zoom. It was
 * written four ways, some clamping the latitude and some not (the hand-built
 * audit, 2026-11-12). No MapLibre here: Keep for the Air reaches this from
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

/** Where a longitude falls across the Web Mercator world, 0 at 180 W to 1
 *  at 180 E. */
export const mercX = (lon: number) => (lon + 180) / 360;

/** Where a latitude falls down the Web Mercator world, 0 at its top edge
 *  to 1 at its bottom; the latitude clamped to the projection's edge. */
export function mercY(lat: number): number {
  const phi = (Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)) * Math.PI) / 180;
  return (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2;
}

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
