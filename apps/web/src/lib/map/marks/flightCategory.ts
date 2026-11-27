import { callEngine } from "../../engine/engine";
import { CATEGORY, CATEGORY_CHIP, CATEGORY_UNKNOWN } from "../../tokens";

/** The FAA's own categories, in the colours a pilot already reads them
 *  in: green good, blue marginal, red instrument, magenta worse than
 *  that. Grey where the field filed no report -- which is not "fine",
 *  it is "unknown", and it must not look like the green one.
 *
 *  The one map of them on the page: every marker that colours itself
 *  by current weather (Class B airports, and the route's own departure
 *  and destination) and the briefing's METAR badges. */
const CATEGORY_COLOURS = CATEGORY;
const UNKNOWN_COLOUR = CATEGORY_UNKNOWN;

/** JSON has no Infinity or NaN: an unlimited figure goes as the largest
 *  number, and NaN, which every bound passes as it passes Infinity, the
 *  same. */
function figure(x: number | null | undefined): number | null {
  if (x == null) return null;
  if (Number.isNaN(x) || x === Infinity) return Number.MAX_VALUE;
  return x === -Infinity ? -Number.MAX_VALUE : x;
}

/** The category a ceiling and a visibility fall in, by the FAA's own
 *  bounds (AIM 7-1-7, "Categorical Outlooks"; the worse of the two
 *  decides), worked out by the shared engine (engine/crates/weather/src/forecast,
 *  through lib/engine), the very rule the planner's modelled weather and
 *  the phones use: the bounds and their sources live there. No ceiling is
 *  no limit; with no visibility only a ceiling under 500 ft decides it,
 *  LIFR, and over that there is no category -- the visibility could still
 *  make it worse (a TAF period's read gave one, a METAR heard over FIS-B
 *  none). A METAR from the planner comes with its category; a TAF
 *  period's figures and a METAR's text read here do not. */
export function categoryOf(ceilingFt: number | null | undefined, visibilitySm: number | null | undefined): string | null {
  return callEngine("flight_category", { ceiling_ft: figure(ceilingFt), visibility_sm: figure(visibilitySm) });
}

export function colourOf(category: string | null | undefined): string {
  return (category && CATEGORY_COLOURS[category]) || UNKNOWN_COLOUR;
}

/** A category as the fill of a chip that has its name in words on it:
 *  the map's colour, or a deeper one where white words would read under
 *  4.5:1 on it (LIFR's #7E3FB8, 6.4:1, where the map's #A371F7 is
 *  3.35:1; design/tokens.json color.category.lifr-chip). */
export function chipFillOf(category: string | null | undefined): string {
  return (category && CATEGORY_CHIP[category]) || UNKNOWN_COLOUR;
}

/** A category set as words (the search's "MVFR"): the scheme's own ink,
 *  a shade of the dot's hue that reads 4.5:1 and more on every surface by
 *  day and a lighter one at night (design/tokens.json color.theme's
 *  category-*-ink; the owner, 2026-11-27: "Lighter word colour at night").
 *  The dot, the chip and the map's mark keep the FAA's colour (colourOf). */
export function inkOf(category: string | null | undefined): string {
  const known = category && category in CATEGORY_COLOURS ? category.toLowerCase() : "unknown";
  return `var(--category-${known}-ink)`;
}

/** A category's dot or bar ringed in the chart's casing, as the map draws
 *  its marks, so each reads 3:1 and more against what is next to it
 *  (WCAG 1.4.11): at night the FAA's deep blue and red stand off the
 *  night's navy (2.3 to 3.2:1 on it alone) and no report's grey off the
 *  night's glass (2.78:1); by day LIFR's #a371f7 off Chart ink's and
 *  Sunlight's muted fills (2.75 and 2.89:1), 3.35:1 against the ring (the
 *  round-4 themes audit). On a white surface the ring is unseen. */
export const DOT_RING = "ring-1 ring-(--chart-casing)";

/** A chip's colour for what is known of a field's weather: its category
 *  once there is a report, grey while checking, when it could not be
 *  checked, and when the field has no report. */
export function chipColourOf(weather: { status: string; category: string | null } | null | undefined): string {
  return colourOf(weather?.status === "reported" ? weather.category : null);
}
