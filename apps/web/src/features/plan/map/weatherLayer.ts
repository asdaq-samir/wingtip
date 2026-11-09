import type { MapPirep, StationWind } from "../../../lib/api/types";
import { barbSvg, pirepMark } from "../lib/weatherMap";
import { divIcon, type IconLike } from "../../../lib/map/marks/icons";

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
 *  hazard's colour, in a 44-point target. */
const pirepIcons = new Map<string, IconLike>();
export function pirepIcon(p: MapPirep): IconLike {
  const { glyph, colour, level } = pirepMark(p);
  const key = `${glyph}${colour}${level}`;
  let icon = pirepIcons.get(key);
  if (!icon) {
    icon = divIcon({
      className: "",
      html: `<span style="display:flex;height:44px;align-items:center;justify-content:center"><span style="display:inline-flex;align-items:center;gap:2px;white-space:nowrap;background:#fff;border:2px solid ${colour};border-radius:10px;padding:0 5px;font:700 12px/18px -apple-system,system-ui,sans-serif;color:${colour}">${glyph} ${level}</span></span>`,
      iconSize: [56, 44],
      iconAnchor: [28, 22],
    });
    pirepIcons.set(key, icon);
  }
  return icon;
}

/** A station's wind barb, to ten degrees and five knots. */
const barbIcons = new Map<string, IconLike>();
export function barbIcon(w: StationWind): IconLike {
  const key = `${Math.round(w.dir_true_deg / 10)}-${Math.round(w.speed_kt / 5)}`;
  let icon = barbIcons.get(key);
  if (!icon) {
    icon = divIcon({ className: "", html: barbSvg(w.dir_true_deg, w.speed_kt), iconSize: [44, 44], iconAnchor: [22, 22] });
    barbIcons.set(key, icon);
  }
  return icon;
}
