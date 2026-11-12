import type { MapPirep, StationWind } from "../../../lib/api/types";
import { pirepMark } from "../lib/weatherMap";
import { callEngine } from "../../../lib/engine/engine";
import { stylePicture, type GlPicture } from "../../../lib/map/gl/useGlSymbols";
import { framed } from "../../../lib/map/marks/markPictures";
import { barbId } from "../../../lib/map/marks/stationModel";
import { CHART } from "../../../lib/tokens";

// The weather on the planner's map, at the pilot's pick: where its box
// comes from, and its marks (features/plan/map/layers/WeatherGl draws
// them; WeatherCards are the cards a tap on one opens).

/** The map's view as its four edges. */
type Bounds = { getSouth(): number; getWest(): number; getNorth(): number; getEast(): number };

/** How far out the box asked for is rounded, degrees: a pan within it asks
 *  nothing new. */
const GRID_DEG = 2;

/** The part of the chart in sight, rounded out to the grid. */
export function weatherBoxOf(b: Bounds) {
  const out = (v: number, up: boolean) => (up ? Math.ceil(v / GRID_DEG) : Math.floor(v / GRID_DEG)) * GRID_DEG;
  return {
    south: Math.max(-90, out(b.getSouth(), false)),
    north: Math.min(90, out(b.getNorth(), true)),
    west: Math.max(-180, out(b.getWest(), false)),
    east: Math.min(180, out(b.getEast(), true)),
  };
}

/** A PIREP's chip on the map: its hazard's glyph and its level, in the
 *  hazard's colour, on white edged in it. The glyph is drawn on the chip
 *  (it is not among the map's Inter's letters), the level is the layer's
 *  words in it, the chip stretched to them; PIREP_SHIFT centres the chip
 *  on the report's point. */
export function pirepMarks(p: MapPirep): { picture: GlPicture; text: string; colour: string } {
  const { glyph, colour, level } = pirepMark(p);
  const picture = framed(
    `pirep|${glyph}|${colour}`,
    () =>
      `<rect x="1" y="1" width="38" height="20" rx="10" fill="${CHART.casing}" stroke="${colour}" stroke-width="2"/>` +
      `<text x="7" y="15.5" font-family="-apple-system, system-ui, sans-serif" font-weight="700" font-size="12" fill="${colour}">${glyph}</text>`,
    40,
    22,
    { inset: 10, x: [19, 27], y: [10.5, 11.5], content: [20, 4, 33, 18] },
  );
  return { picture, text: level, colour };
}
/** The level's shift right of the point, ems of its 12 points: the chip
 *  runs 20 points left of the words and 7 right. */
export const PIREP_SHIFT = 6.5 / 12;

/** A station's wind aloft as the station model's barb (stationModel's
 *  pictures, which the chart's airport weather wears too): its flags,
 *  barbs and half-barbs the engine's (wind_barb), turned on the map by
 *  the direction it blows from. */
export function windBarb(w: StationWind): GlPicture {
  return stylePicture(barbId(callEngine("wind_barb", { speed_kt: w.speed_kt })));
}
