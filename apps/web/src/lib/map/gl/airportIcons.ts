import type { ExpressionSpecification } from "maplibre-gl";
import { sectionalAirportSvg, weatherDotSvg } from "../marks/airportMark";
import { colourOf } from "../marks/flightCategory";

/**
 * The tile airports' symbols (glOverlays' airports layer): every picture
 * one can wear -- towered or not, its size, its use, its weather's halo,
 * or the weather's dot in its place (the Map card's Airport Weather) --
 * and the layer's expression choosing one by the tile's fields and each
 * field's METAR. Apart from glOverlays, to keep each a size a reader
 * takes in.
 */

type Picture = [id: string, svg: () => string];

type AirportSize = "large" | "medium" | "small" | "other";
type AirportUse = "military" | "private" | "heliport" | null;

/** A field's symbol's picture by what it is drawn as (sectionalAirportSvg):
 *  towered or not, its size, its weather halo's colour, its use. */
const airportMarkId = (towered: boolean, size: string, weather: string | null, use: string | null) =>
  `apt|${towered ? "t" : "u"}|${size}|${weather ?? ""}|${use ?? ""}`;

const SIZES: AirportSize[] = ["large", "medium", "small", "other"];
const USES: AirportUse[] = [null, "private", "military", "heliport"];
/** Each flight category's colour. */
const CATEGORY_COLOURS = ["VFR", "MVFR", "IFR", "LIFR"].map((c) => colourOf(c));
/** Each flight category's halo, and none. */
const PIPS: (string | null)[] = [null, ...CATEGORY_COLOURS];
/** The dot drawn for a field in place of its symbol (the look Dot). */
const dotId = (colour: string) => `apt-dot|${colour}`;

/** Every airport symbol the tiles can ask for: 2 inks, 4 sizes, 5 halos
 *  and 4 uses, 160 small pictures; and the 4 dots. */
export function airportPictures(): Picture[] {
  const out: Picture[] = [];
  for (const towered of [true, false])
    for (const size of SIZES)
      for (const pip of PIPS)
        for (const use of USES) {
          out.push([airportMarkId(towered, size, pip, use), () => sectionalAirportSvg(towered, size, use, pip)]);
        }
  for (const colour of CATEGORY_COLOURS) out.push([dotId(colour), () => weatherDotSvg(colour)]);
  return out;
}

/** A field's size from its longest runway (NASR APT_RWY RWY_LEN), the
 *  symbol's size: an airline airport's 8,000 ft and more, then 5,000 and
 *  2,000. Only how big the disc is drawn. */
const TILE_SIZE: ExpressionSpecification = [
  "step",
  ["coalesce", ["get", "longest_ft"], 0],
  "other",
  2000,
  "small",
  5000,
  "medium",
  8000,
  "large",
];
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
 *  colour by ident, from the METARs once they are in, and the Map card's
 *  Airport Weather look. */
export const AIRPORT_WEATHER = "airportWeather";
export const AIRPORT_WEATHER_LOOK = "airportWeatherLook";

/** This field's weather colour, "" for none: its ident looked up in the
 *  state's ident → colour object. */
const WEATHER: ExpressionSpecification = [
  "string",
  ["get", ["to-string", ["get", "ident"]], ["object", ["global-state", AIRPORT_WEATHER], ["literal", {}]]],
  "",
];
const LOOK: ExpressionSpecification = ["string", ["global-state", AIRPORT_WEATHER_LOOK], "halo"];

/** The airports' symbol from the tiles: its picture by its ink, size, use
 *  and weather (airportMarkId), the weather read from the map's state, so
 *  a new METAR or look is one state change, not a new expression; with
 *  the look Off no halo, with Dot a field with weather its dot instead
 *  (the Map card's Airport Weather). */
export const TILE_AIRPORT_ICON: ExpressionSpecification = [
  "case",
  ["all", ["==", LOOK, "dot"], ["!=", WEATHER, ""]],
  ["concat", "apt-dot|", WEATHER],
  [
    "concat",
    "apt|",
    ["case", TOWERED, "t", "u"],
    "|",
    TILE_SIZE,
    "|",
    ["match", LOOK, ["off", "dot"], "", WEATHER],
    "|",
    TILE_USE,
  ],
];
