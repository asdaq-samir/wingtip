import type { CircleLayerSpecification, ExpressionSpecification } from "maplibre-gl";
import { CHART, MAP_LABEL, type MapLabelKind } from "../../../tokens";
/** The map's words, in the page's Inter (GlMapShell's font-faces), in
 *  every look: the map's colours are the chart's own, not the look's. */
export const GL_FONT = ["Inter"];
/** The chart's labels in bold, as ForeFlight sets its idents: the same
 *  Inter at weight 700 (GlMapShell's second font-face). */
export const GL_FONT_BOLD = ["Inter Bold"];

/** A label's size by the map's zoom: MapLibre's zooms and the sizes at
 *  them, interpolated between. */
function labelByZoom(stops: readonly (readonly [glZoom: number, px: number])[]): ExpressionSpecification {
  return ["interpolate", ["linear"], ["zoom"], ...stops.flat()] as unknown as ExpressionSpecification;
}

/** The map's global state (MapLibre's `global-state`) that says it is
 *  dark: set from the page's dark theme (useDarkTheme) by ChartGl. */
export const LABEL_NIGHT = "labelNight";
/** The light halo's colour: the chart's white by day; after dark the same
 *  white at map.label.halo-night, so it does not glare over a chart dimmed
 *  to half. One expression, read by every layer's paint, so the theme's
 *  change is one setGlobalStateProperty. */
const HALO_COLOUR: ExpressionSpecification = [
  "case",
  ["boolean", ["global-state", LABEL_NIGHT], false],
  `${CHART.casing}${Math.round(MAP_LABEL.haloNight * 255)
    .toString(16)
    .padStart(2, "0")}`,
  CHART.casing,
];
/** The halo round the map's labels: white and wide enough to read on the
 *  chart's own ink. */
export const LABEL_HALO = { "text-halo-color": HALO_COLOUR, "text-halo-width": MAP_LABEL.halo } as const;

export type LabelKind = keyof typeof MAP_LABEL.kind;

/** A kind of label's words as design/tokens.json's map.label.kind letters
 *  them: Inter in its weight, at its size, fixed or by zoom (the token's
 *  zooms are the app's levels, glZoom's less one). Every layer that writes
 *  words on the map takes these, so one kind reads alike wherever it is. */
export function labelText(kind: LabelKind): { "text-font": string[]; "text-size": number | ExpressionSpecification } {
  const k: MapLabelKind = MAP_LABEL.kind[kind];
  const size = typeof k.size === "number" ? k.size : labelByZoom(k.size.map(([z, px]) => [z - 1, px] as const));
  return { "text-font": k.bold ? GL_FONT_BOLD : GL_FONT, "text-size": size };
}

/** And its halo: the chart's white (dimmed after dark) round dark or
 *  coloured words, the tag's dark round white ones, or none for words on
 *  their own chip, tab or pill, which is their ground. Each at the one
 *  width, map.label.halo. */
export function labelHalo(kind: LabelKind): { "text-halo-color"?: ExpressionSpecification | string; "text-halo-width"?: number } {
  const halo = MAP_LABEL.kind[kind].halo;
  if (halo === "light") return LABEL_HALO;
  if (halo === "dark") return { "text-halo-color": CHART.tag, "text-halo-width": MAP_LABEL.halo };
  return {};
}

/** A tap's reach and order: a mark within a finger's half-width (a 44 pt
 *  target), a line within 10 px; the route's airports
 *  before its checkpoints before anything on the chart under them. */
export const TAP = { mark: 22, line: 10, rank: { field: 0, checkpoint: 1, mark: 2, line: 5, area: 8 } } as const;

/** The one ring round a thing picked, every kind alike (rules.md §14): in
 *  the brand's Taxiway Yellow (CHART.selected, the owner, 2026-11-09 and
 *  2026-11-18: one selection colour), radius 20, cased white, then the
 *  shade's dark edge, so it holds over the sectional's towns, as yellow as
 *  it is (about 1.6:1 there alone), and its pale greens (1.4:1). Its three
 *  layers from `source`, ids `<prefix>-edge`, `<prefix>-casing` and
 *  `<prefix>`, drawn in the `top` slot. */
export function selectionRing(prefix: string, source: string): CircleLayerSpecification[] {
  const ring = (id: string, color: string, width: number): CircleLayerSpecification => ({
    id,
    type: "circle",
    source,
    paint: { "circle-radius": 20, "circle-opacity": 0, "circle-stroke-color": color, "circle-stroke-width": width },
  });
  return [ring(`${prefix}-edge`, `${CHART.shade}8c`, 9), ring(`${prefix}-casing`, CHART.casing, 6), ring(prefix, CHART.selected, 3)];
}
