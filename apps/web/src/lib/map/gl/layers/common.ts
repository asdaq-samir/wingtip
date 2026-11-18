import type { ExpressionSpecification } from "maplibre-gl";
import { CHART, MAP } from "../../../tokens";
/** The map's words, in the page's Inter (GlMapShell's font-faces), in
 *  every look: the map's colours are the chart's own, not the look's. */
export const GL_FONT = ["Inter"];
/** The chart's labels in bold, as ForeFlight sets its idents: the same
 *  Inter at weight 700 (GlMapShell's second font-face). */
export const GL_FONT_BOLD = ["Inter Bold"];

/** The map's label sizes, px, from design/tokens.json's map.label-*: one
 *  scale for every layer, and none under `small`, 11, the floor. */
export const LABEL_SIZE = {
  small: MAP.labelSmall,
  normal: MAP.label,
  large: MAP.labelLarge,
  count: MAP.labelCount,
  runway: MAP.labelRunway,
} as const;

/** A label's size by the map's zoom: MapLibre's zooms and the sizes at
 *  them, interpolated between. */
export function labelByZoom(stops: [glZoom: number, px: number][]): ExpressionSpecification {
  return ["interpolate", ["linear"], ["zoom"], ...stops.flat()] as unknown as ExpressionSpecification;
}

/** The map's global state (MapLibre's `global-state`) that says it is
 *  dark: set from the page's dark theme (useDarkTheme) by ChartGl. */
export const LABEL_NIGHT = "labelNight";
/** The halo's colour: the chart's white by day; after dark the same white
 *  at map.label-halo-night, so it does not glare over a chart dimmed to
 *  half. One expression, read by every layer's paint, so the theme's
 *  change is one setGlobalStateProperty. */
const HALO_COLOUR: ExpressionSpecification = [
  "case",
  ["boolean", ["global-state", LABEL_NIGHT], false],
  `${CHART.casing}${Math.round(MAP.labelHaloNight * 255)
    .toString(16)
    .padStart(2, "0")}`,
  CHART.casing,
];
/** The halo round the map's labels: white and wide enough to read on the
 *  chart's own ink. */
export const LABEL_HALO = { "text-halo-color": HALO_COLOUR, "text-halo-width": MAP.labelHalo } as const;

/** A tap's reach and order: a mark within a finger's half-width (a 44 pt
 *  target), a line within 10 px; the route's airports
 *  before its checkpoints before anything on the chart under them. */
export const TAP = { mark: 22, line: 10, rank: { field: 0, checkpoint: 1, mark: 2, line: 5, area: 8 } } as const;
