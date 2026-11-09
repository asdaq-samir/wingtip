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
