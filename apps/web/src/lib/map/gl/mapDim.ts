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

/** One opacity times the dim (or `by`, the dim now as a figure, which a
 *  fade eases to: glFadeIn). MapLibre takes the zoom only as the input
 *  of a top-level interpolate or step, so there the dim goes into each
 *  stop's output; anything else is multiplied whole. */
export function dimmedOpacity(value: unknown, by: unknown = DIM): unknown {
  const times = (v: unknown) => ["*", by, v];
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

/** What a layer marked so (DIM_BY_COLOUR) has its colours dimmed in, by
 *  layer type, its opacities left as they are. */
const COLOURS: Partial<Record<LayerSpecification["type"], readonly string[]>> = {
  line: ["line-color"],
  circle: ["circle-color", "circle-stroke-color"],
  symbol: ["text-color", "icon-color"],
};

/** A layer's metadata that has it take the dim in its colours rather than
 *  its opacities: the colour times the chart's brightness, as the chart's
 *  own raster-brightness-max dims its inks, where a see-through line
 *  over the dimmed chart loses its contrast with it (the route's magenta
 *  at the night's default Dimmer: 1.16 to 1 over the paper by opacity,
 *  2.4 to 1 by colour). Only for a constant colour: one by feature would
 *  have MapLibre lay its source out again at every move of the Dimmer. */
export const DIM_BY_COLOUR = { "wingtip:dim": "colour" } as const;

type Dimmable = { type?: string; metadata?: unknown } | null | undefined;
const byColour = (layer: Dimmable) => (layer?.metadata as Record<string, unknown> | undefined)?.["wingtip:dim"] === "colour";
const propsOf = (layer: Dimmable) =>
  layer?.type ? ((byColour(layer) ? COLOURS : DIMMED)[layer.type as LayerSpecification["type"]] ?? []) : [];

/** One colour times the dim: black at none, itself at 1. */
export function dimmedColour(colour: unknown): unknown {
  return ["interpolate", ["linear"], DIM, 0, "#000000", 1, colour];
}

/** Whether a layer's paint property is one the dim reaches. */
export function isDimmed(layer: Dimmable, prop: string): boolean {
  return propsOf(layer).includes(prop);
}

/** A paint value as it is set on a layer: times the dim where the dim
 *  reaches it (an opacity, or a colour of a layer dimmed by colour). */
export function dimmedPaint(layer: Dimmable, prop: string, value: unknown, by?: number): unknown {
  if (!isDimmed(layer, prop)) return value;
  return byColour(layer) ? dimmedColour(value) : dimmedOpacity(value, by);
}

/** A layer as it is added to the map: its opacities, its own or 1, times
 *  the dim; or, marked DIM_BY_COLOUR, the colours it sets. */
export function dimLayer<T extends LayerSpecification>(layer: T): T {
  const props = propsOf(layer);
  if (!props.length) return layer;
  const paint = { ...((layer as { paint?: Record<string, unknown> }).paint ?? {}) };
  for (const p of props) if (!byColour(layer) || paint[p] !== undefined) paint[p] = dimmedPaint(layer, p, paint[p]);
  return { ...layer, paint } as T;
}
