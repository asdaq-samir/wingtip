import type { AirspaceClass } from "../../preferences";
import { OVERLAY_EXPRESSIONS, OVERLAY_STATE } from "../../generated/overlayLayers";
import { AIRPORT_MARK, airportMarkSvg } from "../marks/airportMark";
import { colourOf } from "../marks/flightCategory";
import { svgPicture, type GlPicture } from "./useGlSymbols";

/**
 * The tile airports' symbols (glOverlays' airports layer): the planner's
 * one airport mark (airportMarkSvg, as Nearest's rows, the route and the
 * stops draw it), in every variant a field can wear -- the ring in its
 * surface airspace's chart code, its weather the disc in the middle, its
 * use the R, M or H disc -- whose ids the layers' expressions choose by the
 * tile's fields and each field's METAR (design/map-style.json's
 * tileAirportIcon), sized by the field (the owner's pick, 2026-11-14,
 * option I of https://claude.ai/artifact/V1d9RDbmY1aczc4LfXed7a).
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
 *  (map-style.json's markSize) is as sharp as the chart under it, not a
 *  stretched bitmap: the style's markScale for the web is its inverse. */
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

/** A field's ident in its symbol's colour, as the sectional sets a
 *  field's name (Chart User's Guide, Airports: towered blue, the rest
 *  magenta), by the feature's `towered`: the tiles' every field
 *  (design/map-style.json), and the marks the map draws itself (the Class B
 *  fields', a stop's) the same, so a field reads alike whichever layer draws it. */
export const AIRPORT_IDENT_INK = OVERLAY_EXPRESSIONS.airportIdentInk;
/** The map's global state the airports' layers read, set by glOverlays:
 *  each field's weather colour by ident, from the METARs once they are in. */
export const AIRPORT_WEATHER = OVERLAY_STATE.airportWeather;

/** The airports' symbol from the tiles: its picture (airportPictures' ids)
 *  by its ring, weather and use, the weather read from the map's state, so
 *  a new METAR is one state change, not a new expression. */
export const TILE_AIRPORT_ICON = OVERLAY_EXPRESSIONS.tileAirportIcon;
