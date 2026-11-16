import type { ChartInfo, ChartLayer, ChartSheet } from "../../api/types";
import { tileFraction } from "../tileMath";

/**
 * The chart the map draws as its base -- the kind asked for, or the
 * sectional where the course has no such layer -- and the terminal-area
 * kind that belongs over that base: the TAC over the sectional, the IFR
 * area charts over the IFR enroute ones. Resolved here once, for every
 * reader: the Class B pin resolved its own, always the TAC's, and said
 * "Pin the Chicago TAC" on an IFR base while the map drew the IFR area
 * chart. With the chart None, the map draws no chart (ChartGl), and what
 * else asks -- a route kept for the air, a Class B chip's sheet -- is
 * given the sectional's, the chart a pilot most likely turns back to.
 */
export function chartPair(layers: ChartLayer[], base: string): { base: ChartLayer | null; overlay: ChartLayer | null } {
  const baseLayer = layers.find((l) => l.kind === base) ?? layers.find((l) => l.kind === "sec") ?? null;
  const overlay = baseLayer ? (layers.find((l) => !l.base && l.over.includes(baseLayer.kind)) ?? null) : null;
  return { base: baseLayer, overlay };
}

/** The overlay's sheet at a point -- what pinning the overlay there
 *  would draw -- or null where it has none. */
export function sheetAt(overlay: ChartLayer | null, lat: number, lon: number): ChartSheet | null {
  return overlay?.sheets.find((s) => s.south <= lat && lat <= s.north && s.west <= lon && lon <= s.east) ?? null;
}

/** The cycle and revision a kind's tiles are drawn from: its layer's own,
 *  each kind going over to a new cycle as its pyramid is finished
 *  (wingtip.charts.serving_cycle_of), else the chart's, the sectional's. */
export function kindCycle(
  chart: Pick<ChartInfo, "chart_cycle" | "chart_revision" | "chart_layers">,
  kind: string,
): { cycle: string; revision: number } {
  const layer = chart.chart_layers?.find((l) => l.kind === kind);
  // A course cached offline from before the planner reported one has none.
  return layer?.cycle
    ? { cycle: layer.cycle, revision: layer.revision ?? 0 }
    : { cycle: chart.chart_cycle, revision: chart.chart_revision ?? 0 };
}

/**
 * The "@2x" a kind's tile names carry on this screen: on a 2x or 3x
 * screen, where the kind was drawn at twice the pixels too (its layer's
 * `scales`), the 512-pixel tile of the same z/x/y, drawn from the FAA's
 * sheet at that size. The map lays it out in the tile's own 256 CSS
 * pixels (the chart's raster source takes these URLs with tileSize 256,
 * glStyle), so nothing about the grid changes, only how sharp it is: the
 * 256-pixel tile stretched three times by the browser blurred every
 * letter and line on a phone. None where the
 * kind has only 256-pixel tiles, as a cycle drawn before there were any
 * has, and none on a 1x screen, which would only shrink them.
 */
export function tileDensity(
  chart: Pick<ChartInfo, "chart_layers">,
  kind: string,
  pixelRatio = globalThis.devicePixelRatio ?? 1,
): "" | "@2x" {
  const layer = chart.chart_layers?.find((l) => l.kind === kind);
  return pixelRatio > 1 && layer?.scales?.includes(2) ? "@2x" : "";
}

/**
 * Where a chart kind's tiles come from. Published to a CDN (the AWS
 * deployment) they come straight from there and the cycle is a path
 * segment; served by the planner itself, through the gateway, the
 * cycle is the cache-busting query: the tiles are cacheable for weeks,
 * and a browser that cached this {z}/{x}/{y} under an earlier edition
 * must ask again when the edition changes.
 *
 * The revision rides along for the same reason: tiles rendered again
 * within an edition (a sheet cleaned on disk) keep {z}/{x}/{y} and the
 * cycle, and the service worker answers from its cache before it ever
 * asks the network -- one phone showed a white sliver the planner had
 * long since stopped drawing.
 */
export function tileTemplate(chart: ChartInfo, kind: string): string {
  const { cycle, revision } = kindCycle(chart, kind);
  const density = tileDensity(chart, kind);
  return chart.chart_tiles_base
    ? `${chart.chart_tiles_base}/${cycle}/${kind}/{z}/{x}/{y}${density}.png?r=${revision}`
    : `/api/planner/chart-tile/${kind}/{z}/{x}/{y}${density}.png?c=${cycle}&r=${revision}`;
}

export function tileUrl(chart: ChartInfo, kind: string, z: number, x: number, y: number): string {
  return tileTemplate(chart, kind).replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/** The slippy-map tile a point is in at zoom `z` (Web Mercator, as the
 *  chart's pyramid is cut), and where in it the point
 *  falls (0 to 1 across and down), for the card to centre on it. */
export function tileAt(lat: number, lon: number, z: number): { x: number; y: number; fx: number; fy: number } {
  const { x: tx, y: ty } = tileFraction(lat, lon, z);
  const x = Math.floor(tx);
  const y = Math.floor(ty);
  return { x, y, fx: tx - x, fy: ty - y };
}
