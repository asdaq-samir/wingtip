import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";

/**
 * The Dimmer over what is drawn on the chart, not the chart's tiles alone
 * (the themes audit, 2026-11-27: at night the Dimmer darkened the chart
 * while its words, marks and lines stayed at full light). At night every
 * symbol's words and icons, every line and every circle is drawn at the
 * chart's own brightness as an opacity (chartBrightness: 0.5 by default,
 * 0.3 at the Dimmer's deepest), so nothing on the map is brighter than
 * the chart under it and the pilot's dark adaptation is kept (AIM 8-1-6,
 * Vision in Flight). By day it is 1: a light halo made see-through would
 * only lose its words in the chart's ink.
 *
 * One global state (MapLibre's `global-state`), set by ChartGl, read by
 * every such paint through `dimPaint`, so a Dimmer's move is one
 * setGlobalStateProperty with no layer made again. Rasters (the chart,
 * imagery, a plate: their own brightness) and fills (the airspace's and
 * the weather's washes, already faint) are not touched.
 */
export const MAP_DIM = "mapDim";
const DIM = ["coalesce", ["global-state", MAP_DIM], 1] as unknown as ExpressionSpecification;

/** The opacities dimmed, by layer type. */
const DIMMED: Partial<Record<LayerSpecification["type"], readonly string[]>> = {
  line: ["line-opacity"],
  circle: ["circle-opacity", "circle-stroke-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
};

/** The figure the global state holds: the chart's brightness at night,
 *  1 by day. */
export function mapDimOf(night: boolean, chartBrightness: number): number {
  return night ? Math.min(1, Math.max(0, chartBrightness)) : 1;
}

/** One opacity times the dim. MapLibre takes the zoom only as the input
 *  of a top-level interpolate or step, so there the dim goes into each
 *  stop's output; anything else is multiplied whole. */
export function dimmedOpacity(value: unknown): unknown {
  const times = (v: unknown) => ["*", DIM, v];
  if (Array.isArray(value) && (value[0] === "interpolate" || value[0] === "interpolate-hcl" || value[0] === "interpolate-lab")) {
    const [op, how, input, ...stops] = value as unknown[];
    return [op, how, input, ...stops.map((s, i) => (i % 2 === 1 ? times(s) : s))];
  }
  if (Array.isArray(value) && value[0] === "step") {
    const [op, input, first, ...stops] = value as unknown[];
    return [op, input, times(first), ...stops.map((s, i) => (i % 2 === 1 ? times(s) : s))];
  }
  return times(value ?? 1);
}

/** Whether a layer type's paint property is one the dim reaches. */
export function isDimmed(type: string | undefined, prop: string): boolean {
  return !!type && (DIMMED[type as LayerSpecification["type"]] ?? []).includes(prop);
}

/** A layer as it is added to the map: its opacities, its own or 1, times
 *  the dim. */
export function dimLayer<T extends LayerSpecification>(layer: T): T {
  const props = DIMMED[layer.type];
  if (!props) return layer;
  const paint = { ...((layer as { paint?: Record<string, unknown> }).paint ?? {}) };
  for (const p of props) paint[p] = dimmedOpacity(paint[p]);
  return { ...layer, paint } as T;
}
