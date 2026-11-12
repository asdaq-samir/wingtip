/**
 * The slippy-map tile scheme's one formula, the Web Mercator projection
 * (EPSG:3857) the map, the chart's pyramid and the overlay archive are
 * all cut by: where a point falls, in tiles, at a zoom. It was written
 * four ways, some clamping the latitude and some not (the hand-built
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

/** Where a point falls in the tile grid at zoom `z`, in tiles and
 *  fractions of one, (0, 0) the top left of the world; the latitude
 *  clamped to the projection's edge. */
export function tileFraction(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const phi = (Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)) * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2) * n };
}

/** The tile a point is in at zoom `z`. */
export function tileOf(lat: number, lon: number, z: number): { x: number; y: number } {
  const { x, y } = tileFraction(lat, lon, z);
  return { x: Math.floor(x), y: Math.floor(y) };
}
