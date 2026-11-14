import type { AirspaceClass } from "../../preferences";
import { CHART } from "../../tokens";
import { svgPicture, type GlPicture } from "../gl/useGlSymbols";
import type { Stretch } from "../gl/glLayer";
import { AIRPORT_MARK, airportMarkSvg, text } from "./airportMark";
import { WAYPOINT_MAGENTA } from "./chartColors";

/**
 * The pictures the app's own marks wear on the map (useGlSymbols), as SVG
 * drawn once a map: a mark's shape, and the chip its words sit on,
 * stretched to them by MapLibre (icon-text-fit). The words themselves are
 * the map's, in the style's Inter (markLayers).
 */

/** Room round a picture for its shadow. */
const PAD = 3;

/** The marks' shadow, the page's --depth-mark (0 1px 3px, a third dark),
 *  in the chart's shade. */
const SHADOW =
  `<defs><filter id="d" x="-50%" y="-50%" width="200%" height="200%">` +
  `<feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="${CHART.shade}" flood-opacity="0.35"/></filter></defs>`;

/** A picture drawn in a `w` by `h` box with room round it for its shadow;
 *  a stretch given in the box's own points. */
export function framed(id: string, inner: () => string, w: number, h: number, stretch?: Stretch, shadow = true): GlPicture {
  const out = (v: number) => v + PAD;
  const moved: Stretch | undefined = stretch && {
    inset: stretch.inset + PAD,
    ...(stretch.x && { x: stretch.x.map(out) as [number, number] }),
    ...(stretch.y && { y: stretch.y.map(out) as [number, number] }),
    ...(stretch.content && { content: stretch.content.map(out) as [number, number, number, number] }),
  };
  return svgPicture(
    id,
    () =>
      `<svg width="${w + 2 * PAD}" height="${h + 2 * PAD}" viewBox="${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}">` +
      `${shadow ? SHADOW : ""}<g${shadow ? ` filter="url(#d)"` : ""}>${inner()}</g></svg>`,
    moved,
  );
}

/** A checkpoint's dot in its colour, the nav log's number on it in the
 *  ink that reads on that colour (the layer's `ink`): a white casing to
 *  part it from dark linework, a dark hairline outside that for pale
 *  paper, and a shadow to lift it off both. 24 points across, so the
 *  bold figures (a route's count runs to three) clear its curve. */
export function dotPicture(fill: string): GlPicture {
  return framed(
    `dot|${fill}`,
    () =>
      `<circle cx="13" cy="13" r="12.5" fill="none" stroke="${CHART.shade}" stroke-opacity="0.55"/>` +
      `<circle cx="13" cy="13" r="12" fill="${CHART.casing}"/><circle cx="13" cy="13" r="9.5" fill="${text(fill)}"/>`,
    26,
    26,
  );
}

/** A point the route works out -- a top of climb or descent -- as a pill
 *  on the course itself, centred on its point (a waypoint or POS0 the route
 *  turns at is turnDotPicture and its name beside it since 2026-11-14):
 *  the chart's magenta diamond
 *  of a fix and its name, white edged in the magenta (the owner's "TOC and
 *  TOD should have the fix on the course for those labels. Just like that
 *  POS0 should have a fix symbol with a label POS0"; "still make those
 *  route labels as pills", 2026-10-26). The words start 18 points in, past
 *  the diamond; FIX_PILL_SHIFT centres the whole pill on the point. */
export const FIX_PILL: GlPicture = framed(
  "fix-pill",
  () =>
    `<rect x="1" y="1" width="30" height="17" rx="8.5" fill="${CHART.casing}" stroke="${WAYPOINT_MAGENTA}" stroke-width="2"/>` +
    `<path d="M10 4.4L14.6 9.5L10 14.6L5.4 9.5Z" fill="${WAYPOINT_MAGENTA}"/>`,
  32,
  19,
  { inset: 9, x: [20, 22], y: [9, 10], content: [18, 4, 24, 15] },
);
/** The words' shift right of the point, ems, so the pill (18 points of
 *  diamond to their left, 8 to their right) is centred on it. */
export const FIX_PILL_SHIFT = 5 / 11;

/** Where the route turns (the owner's option A, 2026-11-14): a small
 *  ringed dot exactly on a route point the legs meet at -- a waypoint, a
 *  present position (POS0) -- white with the course's magenta ring, so
 *  the turn and own ship on it stay in sight; its name is ROUTE_POINT_PILL
 *  beside it, outside the turn (routeTurns). */
export function turnDotPicture(ring: string): GlPicture {
  return framed(`turn-dot|${ring}`, () => `<circle cx="7" cy="7" r="5.5" fill="${CHART.casing}" stroke="${ring}" stroke-width="3"/>`, 14, 14);
}

/** A route point's name pill, beside its dot: white edged in the
 *  sectional's waypoint magenta, stretched to the name. */
export const ROUTE_POINT_PILL: GlPicture = framed(
  "route-point-pill",
  () => `<rect x="0.75" y="0.75" width="18.5" height="18.5" rx="9.25" fill="${CHART.casing}" stroke="${WAYPOINT_MAGENTA}" stroke-width="1.5"/>`,
  20,
  20,
  { inset: 9.5, content: [8, 4, 12, 16] },
);

/**
 * An airport on the map, as ForeFlight marks them from the sectional's
 * own symbols (airportMarkSvg): a ring with four ticks in the look its
 * airspace has everywhere in the planner, a dot in the colour of the
 * field's weather. Its ident is the layer's words beside it.
 */
export function fieldMarkPicture(space: AirspaceClass | null, weather: string, use: "military" | "private" | null = null): GlPicture {
  // The ticks' casing reaches past the mark's 26-point box: drawn in a
  // box with room for it, the mark at its middle.
  const room = 3;
  return framed(
    `field|${space ?? ""}|${weather}|${use ?? ""}`,
    () => airportMarkSvg(space, weather, use, "").replace(/^<svg /, `<svg x="${room}" y="${room}" overflow="visible" `),
    AIRPORT_MARK + 2 * room,
    AIRPORT_MARK + 2 * room,
  );
}

/** The route's own airports' ident pill (ForeFlight's selected course,
 *  the owner's screenshot, 2026-11-08): white bold on a dark rounded
 *  pill, which reads over the sectional's paper, its cities' yellow and
 *  the course's magenta and green alike. */
export const ROUTE_PILL: GlPicture = framed(
  "route-pill",
  () =>
    `<rect x="0.5" y="0.5" width="13" height="13" rx="3.5" fill="${CHART.tag}" fill-opacity="0.88" stroke="${CHART.casing}" stroke-opacity="0.25"/>`,
  14,
  14,
  { inset: 4.5, content: [5, 3, 9, 11] },
);
