import type { CircleLayerSpecification } from "maplibre-gl";
import { CHART } from "../../../tokens";
/** The map's words, in the page's Inter (GlMapShell's font-faces). */
export const GL_FONT = ["Inter"];
/** The chart's labels in bold, as ForeFlight sets its idents: the same
 *  Inter at weight 700 (GlMapShell's second font-face). */
export const GL_FONT_BOLD = ["Inter Bold"];
/** The halo round the map's bold labels: white and wide enough to read
 *  on the chart's own ink. */
export const LABEL_HALO = { "text-halo-color": CHART.casing, "text-halo-width": 2 } as const;

/** A tap's reach and order: a mark within a finger's half-width (a 44 pt
 *  target), a line within 10 px; the route's airports
 *  before its checkpoints before anything on the chart under them. */
export const TAP = { mark: 22, line: 10, rank: { field: 0, checkpoint: 1, mark: 2, line: 5, area: 8 } } as const;

/** The one ring round a thing picked, every kind alike (rules.md §13): in
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
