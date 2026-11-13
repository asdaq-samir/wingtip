import type { TrafficAircraft } from "../../../lib/api/types";
import { callEngine, type EngineAnswer } from "../../../lib/engine/engine";
import { M_PER_NM, type Geo, type LatLon } from "../../../lib/geo";
import type { Fix } from "../../../lib/map/position/ownShip";
import { WORLD_WIDTH_M } from "../../../lib/map/tileMath";

/*
 * The rules here -- the height under an airplane as TCAS writes it, whether
 * it is near own ship's (1,000 ft, 14 CFR 91.159's spacing), which airplane
 * is own ship's own transponder, when and how near one comes -- are the
 * shared engine's (engine/crates/route/src/motion/traffic.rs, through
 * lib/engine), the very code the phones ask (the generated `call`). What runs
 * every frame stays here -- an airplane carried on along its track between
 * reports, its trend line's length at the map's scale, the colours of a
 * flown path.
 */

type Mark = EngineAnswer<"traffic_marks">[number];

/** The engine's marks of the airplanes on the map against own ship's
 *  height, each kept with its airplane (`markTraffic`): one call for them
 *  all, as a call an airplane cost 5 ms for 554 of them, each fix. */
const marked = new WeakMap<TrafficAircraft, { own: number | null; mark: Mark }>();

/** What the engine reads of an airplane's height: with whether it is an
 *  uncorrected pressure altitude, which the engine compares with own
 *  ship's GNSS height on a wider band (traffic_marks). */
const heights = (p: Pick<TrafficAircraft, "altitude_ft" | "vertical_fpm" | "pressure_altitude">) => ({
  altitude_ft: p.altitude_ft ?? null,
  vertical_fpm: p.vertical_fpm ?? null,
  pressure_altitude: p.pressure_altitude ?? null,
});

/** Works out the label and colour of every airplane in `planes` against
 *  own ship's height at once, for trafficLabel and nearOwnHeight to read. */
export function markTraffic(planes: TrafficAircraft[], ownFt: number | null): void {
  const marks = callEngine("traffic_marks", { own_ft: ownFt, planes: planes.map(heights) });
  planes.forEach((p, i) => marked.set(p, { own: ownFt, mark: marks[i]! }));
}

function mark(plane: Pick<TrafficAircraft, "altitude_ft" | "vertical_fpm" | "pressure_altitude">, own: number | null): Mark {
  const kept = marked.get(plane as TrafficAircraft);
  if (kept && kept.own === own) return kept.mark;
  return callEngine("traffic_marks", { own_ft: own, planes: [heights(plane)] })[0]!;
}

/** Under the airplane: its height against own ship's in hundreds of
 *  feet, "+05" above and "-12" below, as TCAS writes it, with an arrow
 *  climbing or descending at 500 ft a minute; with own ship's height not
 *  known, its own height in feet, "4,500". Nothing where it sends none.
 *  The hundreds cut toward own ship, never rounded away from it (the
 *  owner, 2026-10-28). */
export function trafficLabel(plane: TrafficAircraft, ownFt: number | null): string {
  return mark(plane, ownFt).label;
}

/** Whether two heights are within 1,000 ft of each other: the map's
 *  traffic coloured so, and the airplane card's closest approach said in
 *  red. */
export const nearInHeight = (apartFt: number) => mark({ altitude_ft: apartFt, pressure_altitude: false }, 0).near;

/** Whether it is within 1,000 ft of own ship's height. */
export function nearOwnHeight(plane: TrafficAircraft, ownFt: number | null): boolean {
  return mark(plane, ownFt).near;
}

/** The airplanes as they were `ageS` seconds before the answer was
 *  given: each `seen_s` that much more, as `ownShipHex` takes it. */
export function agedBy(planes: TrafficAircraft[], ageS: number): TrafficAircraft[] {
  return planes.map((p) => ({ ...p, seen_s: (p.seen_s ?? 0) + ageS }));
}

/** Own ship's fix as the engine reads one. */
const engineFix = (fix: Fix) => ({
  lat: fix.lat,
  lon: fix.lon,
  heading_deg: fix.headingDeg,
  speed_kt: fix.speedKt,
  altitude_ft: fix.altitudeFt,
});

/**
 * Which airplane, if any, is own ship itself, heard by the receivers on
 * the ground from its own transponder: the one nearest the GPS's fix --
 * within half a mile and 400 ft of it, going the same way at about the
 * same speed -- and only that one, so an airplane in formation or just
 * ahead is not lost with it, the fix taken back by the feed's age
 * (`seen_s`, the answer's age too: `agedBy`).
 */
export function ownShipHex(planes: TrafficAircraft[], fix: Fix | null): string | null {
  // Only what the rule reads crosses, not each airplane's every field.
  const heard = planes.map((p) => ({
    hex: p.hex,
    lat: p.lat,
    lon: p.lon,
    altitude_ft: p.altitude_ft,
    track_deg: p.track_deg,
    speed_kt: p.speed_kt,
    seen_s: p.seen_s,
  }));
  return callEngine("own_ship_hex", { planes: heard, fix: fix ? engineFix(fix) : null });
}

/** How long after its report an airplane is carried on along its track:
 *  past this it may have turned anywhere, and is not drawn (the planner
 *  leaves out positions as old, wingtip.traffic's STALE_S). */
export const CARRY_S = 30;
/** How far ahead its line reaches, seconds: ForeFlight's TrafficTrend
 *  vector shows where a target will be in the next 60. */
const TREND_S = 60;

/** Where an airplane is `seconds` after its report, carried on along its
 *  track at its ground speed, as ForeFlight carries internet traffic on
 *  between reports; where it was where it gives no track or speed. */
export function carriedOn(geo: Geo, plane: TrafficAircraft, seconds: number): LatLon {
  const at = { lat: plane.lat, lon: plane.lon };
  if (plane.track_deg == null || plane.speed_kt == null || seconds <= 0) return at;
  return geo.destination(at, plane.track_deg, (plane.speed_kt * seconds) / 3600);
}

/** How long its trend line is on the screen, points: TREND_S at its
 *  ground speed, at the map's scale there (the Web Mercator world's
 *  width over MapLibre's 512-point world at zoom 0 on the equator: its
 *  camera's tileSize is 512, the world 512 x 2^zoom points wide, not the
 *  raster tiles' 256), at most `max` (160). */
export function trendPx(speedKt: number | null | undefined, lat: number, zoom: number, max = 160): number {
  if (!speedKt) return 0;
  const metres = ((speedKt * TREND_S) / 3600) * M_PER_NM;
  const metresPerPoint = ((WORLD_WIDTH_M / 512) * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  return Math.min(max, metres / metresPerPoint);
}

/** How far ahead its trend line reaches as the map draws it, seconds:
 *  TREND_S, less where that would be more than trendPx's 160 points on
 *  the screen; none with no speed. The line is drawn to where it will be
 *  then (carriedOn), so it is as long as trendPx says. */
export function trendSeconds(speedKt: number | null | undefined, lat: number, zoom: number): number {
  const full = trendPx(speedKt, lat, zoom, Infinity);
  return full > 0 ? (TREND_S * trendPx(speedKt, lat, zoom)) / full : 0;
}

/** A flown path's colour by its height, as FlightAware colours a track:
 *  green on the way up from the ground through yellow and orange to red
 *  at 30,000 ft and purple at 40,000 and above; grey on the ground. */
export function heightColour(altFt: number | null): string {
  if (altFt == null) return "#8e8e93";
  const t = Math.min(1, Math.max(0, altFt / 40000));
  const hue = (120 - 180 * t + 360) % 360;
  return `hsl(${Math.round(hue)} 85% 45%)`;
}

/** A path in runs of one colour (heightColour, its height to 1,000 ft),
 *  each run starting where the last ended, so the line is whole: one
 *  line a run, not a line a point. */
export function colourRuns(path: { lat: number; lon: number; altFt: number | null }[]): { colour: string; points: [number, number][] }[] {
  const runs: { colour: string; points: [number, number][] }[] = [];
  path.forEach((p, i) => {
    const colour = heightColour(p.altFt == null ? null : Math.round(p.altFt / 1000) * 1000);
    const last = runs[runs.length - 1];
    if (last && last.colour === colour) last.points.push([p.lat, p.lon]);
    else
      runs.push({
        colour,
        points:
          i > 0
            ? [
                [path[i - 1]!.lat, path[i - 1]!.lon],
                [p.lat, p.lon],
              ]
            : [[p.lat, p.lon]],
      });
  });
  return runs;
}

/**
 * When and how near an airplane comes to own ship, both carried on
 * straight at their ground speeds -- what a traffic display's closing
 * figures say: {inMin, nm, aboveFt} at the closest within ten minutes,
 * now's where they are already drawing apart. Null without own ship's
 * track and speed or the airplane's. Seconds-old internet data: for
 * knowing what is coming, not for avoiding it.
 */
export function closestApproach(own: Fix, plane: TrafficAircraft): { inMin: number; nm: number; aboveFt: number | null } | null {
  const cpa = callEngine("closest_approach", { own: engineFix(own), plane });
  return cpa && { inMin: cpa.in_min, nm: cpa.nm, aboveFt: cpa.above_ft };
}
