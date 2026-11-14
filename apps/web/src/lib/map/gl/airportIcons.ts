import type { ExpressionSpecification } from "maplibre-gl";
import type { AirspaceClass } from "../../preferences";
import { AIRPORT_MARK, airportMarkSvg } from "../marks/airportMark";
import { colourOf } from "../marks/flightCategory";
import { svgPicture, type GlPicture } from "./useGlSymbols";

/**
 * The tile airports' symbols (glOverlays' airports layer): the planner's
 * one airport mark (airportMarkSvg, as Nearest's rows, the route and the
 * stops draw it), in every variant a field can wear -- the ring in its
 * surface airspace's chart code, its weather the disc in the middle, its
 * use the R, M or H disc -- and the layer's expressions choosing one by the
 * tile's fields and each field's METAR, and sizing it by the field (the
 * owner's pick, 2026-11-14, option I of
 * https://claude.ai/artifact/V1d9RDbmY1aczc4LfXed7a). Apart from
 * glOverlays, to keep each a size a reader takes in.
 */

type AirportUse = "military" | "private" | "heliport" | null;

/** The tiles' `airspace`, the class at the field's surface (charts.airports),
 *  and "" where an older archive has none: the unknown grey ring. */
const SPACES: (AirspaceClass | "")[] = ["B", "C", "D", "E", "G", ""];
const USES: AirportUse[] = [null, "private", "military", "heliport"];
/** Each flight category's colour, and "" for no report (or weather Off),
 *  whose disc is the no-report grey. */
const WEATHERS = ["", ...["VFR", "MVFR", "IFR", "LIFR"].map((c) => colourOf(c))];

/** Drawn this much denser than the screen, so the largest step
 *  (MARK_SIZE) is as sharp as the chart under it, not a stretched bitmap. */
const SHARP = 2;

/** Room round the mark for its ticks' white casing, which reaches past its
 *  box; no more, as the box is what MapLibre keeps apart: with the route
 *  marks' shadow room (markPictures' framed) too, O'Hare's box took
 *  Midway's place at zoom 8, 28 points across and 47 down. */
const ROOM = 3;
const BOX = AIRPORT_MARK + 2 * ROOM;

/** Every airport symbol the tiles can ask for: 6 rings, 5 weathers and 4
 *  uses, 120 small pictures, drawn once a page; the size steps are the
 *  layer's icon-size, not more pictures. */
export function airportPictures(): GlPicture[] {
  const out: GlPicture[] = [];
  for (const space of SPACES)
    for (const weather of WEATHERS)
      for (const use of USES) {
        const mark = airportMarkSvg(space || null, weather || colourOf(null), use, "").replace(/^<svg /, `<svg overflow="visible" `);
        out.push(
          svgPicture(
            `apt|${space}|${weather}|${use ?? ""}`,
            () => `<svg width="${BOX * SHARP}" height="${BOX * SHARP}" viewBox="${-ROOM} ${-ROOM} ${BOX} ${BOX}">${mark}</svg>`,
          ),
        );
      }
  return out;
}

const TILE_USE: ExpressionSpecification = [
  "case",
  ["==", ["get", "military"], "military"],
  "military",
  ["==", ["get", "use"], "private"],
  "private",
  ["==", ["get", "type"], "heliport"],
  "heliport",
  "",
];
export const TOWERED: ExpressionSpecification = ["==", ["get", "towered"], true];

/** The map's global state the airports' layer reads (MapLibre's
 *  `global-state` expression, set by glOverlays): each field's weather
 *  colour by ident, from the METARs once they are in. */
export const AIRPORT_WEATHER = "airportWeather";

/** This field's weather colour, "" for none: its ident looked up in the
 *  state's ident → colour object. */
const WEATHER: ExpressionSpecification = [
  "string",
  ["get", ["to-string", ["get", "ident"]], ["object", ["global-state", AIRPORT_WEATHER], ["literal", {}]]],
  "",
];

/** The airports' symbol from the tiles: its picture by its ring, weather
 *  and use, the weather read from the map's state, so a new METAR is one
 *  state change, not a new expression. The weather's disc with every one
 *  of Settings' Airport Weather but Off, which sets no colour
 *  (lib/map/marks/airportWeatherPrefs). */
export const TILE_AIRPORT_ICON: ExpressionSpecification = [
  "concat",
  "apt|",
  ["coalesce", ["get", "airspace"], ""],
  "|",
  WEATHER,
  "|",
  TILE_USE,
];

/** How much larger each of the engine's size steps is drawn
 *  (field_mark_rank's `size`, the tiles' `size`), as on the owner's canvas:
 *  a Class B's field 1.5 times an ordinary towered field, a Class C's 1.2,
 *  a small field 0.82; an older archive's, with none, 1. The low ends of
 *  the canvas's ranges: at 1.6 and 1.3 O'Hare's mark took Midway's place
 *  at zoom 8, 55 points apart. */
const MARK_SIZE: ExpressionSpecification = ["match", ["get", "size"], "largest", 1.5, "larger", 1.2, "small", 0.82, 1];

/** The mark's icon-size: smaller out at a state's width, a field's own
 *  size closer in, so the small fields don't crowd the chart and the size
 *  follows a pinch frame by frame (a zoom expression, not the page's
 *  state); at each zoom the field's own step, over the denser picture. */
export function airportIconSize(farthest: number, close: number, closest: number): ExpressionSpecification {
  const at = (k: number): ExpressionSpecification => ["*", k / SHARP, MARK_SIZE];
  return ["interpolate", ["linear"], ["zoom"], farthest, at(0.7), close, at(1), closest, at(1.25)];
}
