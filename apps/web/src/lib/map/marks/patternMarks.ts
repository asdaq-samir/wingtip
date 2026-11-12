import { svgPicture, type GlPicture } from "../gl/useGlSymbols";
import { framed } from "./markPictures";
import { CHART } from "../../tokens";

/**
 * The traffic patterns the pilot picked (the route's Procedures), on the
 * chart round their runways: each leg in teal over a white casing, as a
 * procedure is drawn apart from the route's magenta (ForeFlight draws its
 * in a cyan, at the pilot's showing), an arrow along each leg the way it
 * is flown, the downwind named with its altitude, and the 45° entry dashed
 * into it. At the field left from, the runway and its upwind, and the way
 * out of the pattern dashed from its end (departurePattern). Not
 * tappable: a picture of the pattern, the chart under it.
 */
export const TEAL = CHART.pattern;
/** A name's ground, darker: white words on the line's teal were 3.95:1,
 *  under the 4.5:1 small words need (WCAG 1.4.3; the iOS audit). This is
 *  5.2:1. */
const LABEL_TEAL = CHART.patternLabel;

/** From this zoom in, the legs' arrows and names: further out the pattern
 *  is a few pixels round its field, and its words would cover the field's
 *  mark. */
export const PATTERN_WORDS_FROM_ZOOM = 11;

/** An arrowhead the way a leg is flown, at its middle: turned to the leg's
 *  true bearing on the chart (the layer's map-aligned icon-rotate), so it
 *  keeps along the leg as the map turns. */
export const PATTERN_ARROW: GlPicture = svgPicture(
  "pattern-arrow",
  () =>
    `<svg width="16" height="16" viewBox="-8 -8 16 16">` +
    `<path d="M0 -6 L5 4 L0 1.5 L-5 4 Z" fill="${TEAL}" stroke="${CHART.casing}" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
);

/** A leg's name on the chart, white words on teal: the chip, stretched
 *  to them, 18 points tall, six points either side. */
export const PATTERN_LABEL: GlPicture = framed(
  "pattern-label",
  () => `<rect width="16" height="18" rx="6" fill="${LABEL_TEAL}"/>`,
  16,
  18,
  { inset: 7, content: [6, 4, 10, 14] },
);
