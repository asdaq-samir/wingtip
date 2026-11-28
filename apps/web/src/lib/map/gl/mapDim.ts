import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import { linearOf } from "../../rgb";
import { DIMMER } from "../../tokens";
import { LABEL_NIGHT } from "./layers/common";

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
 * the weather's washes, already faint) are not touched. The policy's
 * names, tables and figures are design/tokens.json's map-dim group
 * (DIMMER), which the phones' MapDim and MarkDim read too, and
 * lib/fixtures/mapDim.json holds the three apps to the same cases.
 */
export const MAP_DIM = DIMMER.state;
const DIM = ["coalesce", ["global-state", MAP_DIM], 1] as unknown as ExpressionSpecification;

/** The opacities dimmed, by layer type (map-dim.opacity). */
const DIMMED: Partial<Record<LayerSpecification["type"], readonly string[]>> = DIMMER.opacity;

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
const COLOURS: Partial<Record<LayerSpecification["type"], readonly string[]>> = DIMMER.colour;

/** A layer's metadata that has it take the dim in its colours rather than
 *  its opacities: the colour times the chart's brightness, as the chart's
 *  own raster-brightness-max dims its inks, where a see-through line
 *  over the dimmed chart loses its contrast with it (the route's magenta
 *  at the night's default Dimmer: 1.16 to 1 over the paper by opacity,
 *  2.4 to 1 by colour). Only for a constant colour: one by feature would
 *  have MapLibre lay its source out again at every move of the Dimmer. */
export const DIM_BY_COLOUR = { [DIMMER.metadata]: "colour" } as const;
/** And a night warning's (a TFR's edge, an obstacle in the red): by its
 *  colour too, times WARNING_DIM, which follows the paper's light under
 *  the Contrast as well as the Dimmer, so it holds 3:1 over the paper at
 *  the default Dimmer whatever the Contrast (warningLight). */
export const DIM_WARNING = { [DIMMER.metadata]: "warning" } as const;

type Dimmable = { type?: string; metadata?: unknown; paint?: unknown; getPaintProperty?: (name: never) => unknown } | null | undefined;
const dimKind = (layer: Dimmable) => (layer?.metadata as Record<string, unknown> | undefined)?.[DIMMER.metadata];
const byColour = (layer: Dimmable) => dimKind(layer) === "colour" || dimKind(layer) === "warning";

function reads(value: unknown, state: string): boolean {
  if (!Array.isArray(value)) return false;
  return (value[0] === "global-state" && value[1] === state) || value.some((v) => reads(v, state));
}

/** Whether a symbol layer's words are dimmed by their own ink (labelInk,
 *  which reads the words' light, LABEL_NIGHT): their opacity and colour
 *  are then left whole here, as fading them faded their halo with them
 *  (the themes audit, round 6, N1). A spec's paint, or a style layer's. */
function wordsDimmed(layer: Dimmable): boolean {
  if (layer?.type !== "symbol") return false;
  const colour =
    typeof layer.getPaintProperty === "function"
      ? layer.getPaintProperty("text-color" as never)
      : (layer.paint as Record<string, unknown> | undefined)?.["text-color"];
  return reads(colour, LABEL_NIGHT);
}

const propsOf = (layer: Dimmable) => {
  const props = layer?.type ? ((byColour(layer) ? COLOURS : DIMMED)[layer.type as LayerSpecification["type"]] ?? []) : [];
  return wordsDimmed(layer) ? props.filter((p) => p !== "text-opacity" && p !== "text-color") : props;
};

/** The night's raster-contrast as MapLibre's raster shader applies it, a
 *  grey's factor about the middle: 1/(1-k) for a k over 0, 1+k under. */
const contrastFactor = (k: number) => (k > 0 ? 1 / (1 - k) : 1 + k);

/** The chart's white as the raster shader draws it, encoded sRGB 0 to 1:
 *  raster-contrast first, about the middle, then raster-brightness-max,
 *  the paper the map's marks and words are read against. */
export function paperOf(brightness: number, contrast: number): number {
  return Math.min(1, (0.5 * contrastFactor(contrast) + 0.5) * Math.min(1, Math.max(0, brightness)));
}

/** The paper's light at (brightness, contrast) as the words' share: the
 *  factor that brings the words' light (map-dim's wordLight, the towered
 *  blue's night ink's luminance) to it. */
const paperShare = (brightness: number, contrast: number) =>
  (linearOf(paperOf(brightness, contrast)) / DIMMER.wordLight) ** (1 / DIMMER.wordGamma);

/**
 * The share of their night inks the map's light-haloed words take after
 * dark (common's LABEL_NIGHT), 0 by day: the factor that brings the
 * words' light (map-dim's wordLight, every night ink brought to it) to the
 * paper's, so a word is as light as the chart under it and no lighter
 * (AIM 8-1-6), and on its dark halo, kept whole, reads about 5:1 at the
 * night's default Dimmer. Under the night's own contrast the paper, and
 * the words with it, darken: there the share keeps to map-dim.word-floor
 * (0.75), or to the paper's own light at the night's contrast where the
 * Dimmer takes that lower, so a flatter chart leaves the words 4.5:1 on
 * their halo (the TFR's number at -30%) and the Dimmer still dims them.
 * Never 0 at night (0 is the day), and in hundredths, as each new figure
 * lays the words' sources out again.
 */
export function wordLight(night: boolean, brightness: number, contrast: number): number {
  if (!night) return 0;
  const floor = Math.min(DIMMER.wordFloor, paperShare(brightness, DIMMER.wordFloorContrast));
  const share = Math.max(paperShare(brightness, contrast), floor);
  return Math.max(DIMMER.wordLeast, Math.min(1, Math.round(share * 100) / 100));
}

/** A night warning's colour's share of light against the paper's: 0.85,
 *  so the TFR's red holds 3:1 over the paper across the whole Contrast
 *  range at the default Dimmer (3.10:1 at -30%, where it was 2.57:1 times
 *  the chart's brightness alone; mapContrast.test). */
const WARNING_UNDER_PAPER = DIMMER.warningUnderPaper;

/** The map's global state a warning dimmed by colour reads (DIM_WARNING):
 *  1 by day, at night the paper's light (paperOf) times
 *  WARNING_UNDER_PAPER, so the warning follows the Contrast too, never
 *  brighter than the chart. */
export const WARNING_DIM = DIMMER.warningState;

export function warningLight(night: boolean, brightness: number, contrast: number): number {
  return night ? Math.round(Math.min(1, WARNING_UNDER_PAPER * paperOf(brightness, contrast)) * 100) / 100 : 1;
}

/** One colour times the dim: black at none, itself at 1. */
export function dimmedColour(colour: unknown, by: unknown = DIM): unknown {
  return ["interpolate", ["linear"], by, 0, "black", 1, colour];
}
const WARN = ["coalesce", ["global-state", WARNING_DIM], 1] as unknown as ExpressionSpecification;

/** Whether a layer's paint property is one the dim reaches. */
export function isDimmed(layer: Dimmable, prop: string): boolean {
  return propsOf(layer).includes(prop);
}

/** A paint value as it is set on a layer: times the dim where the dim
 *  reaches it (an opacity, or a colour of a layer dimmed by colour). */
export function dimmedPaint(layer: Dimmable, prop: string, value: unknown, by?: number): unknown {
  if (!isDimmed(layer, prop)) return value;
  if (dimKind(layer) === "warning") return dimmedColour(value, WARN);
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
