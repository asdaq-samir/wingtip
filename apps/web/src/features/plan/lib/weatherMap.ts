import type { MapPirep, WeatherArea } from "../../../lib/api/types";
import { callEngine } from "../../../lib/engine/engine";
import type { Geo, LatLon } from "../../../lib/geo";
import { hundreds, mapLevel } from "../../../lib/format";
import { WEATHER } from "../../../lib/tokens";

// The areas' colours, shared with the flow layer's G-AIRMETs.
export { areaColour } from "../../../lib/map/weatherColours";

/** What an area is, in words: its title ("G-AIRMET · Icing", "Convective
 *  SIGMET") and its altitudes ("Freezing level to FL160"). */
export function areaWords(area: WeatherArea): { title: string; altitudes: string | null } {
  const kind =
    area.kind === "gairmet" ? "G-AIRMET" : area.kind === "convective" ? "Convective SIGMET" : area.kind === "airmet" ? "AIRMET" : "SIGMET";
  // A SIGMET's or AIRMET's hazard code in the engine's words (faa.rs
  // sigmet_hazard), the briefing's own; a G-AIRMET's come in words already.
  const hazard =
    area.kind === "convective"
      ? null
      : area.hazard
        ? area.kind === "gairmet"
          ? area.hazard
          : callEngine("sigmet_hazard", { hazard: area.hazard, kind: null })
        : null;
  const low = area.from_freezing_level ? "Freezing level" : area.low_ft == null ? "Surface" : mapLevel(area.low_ft);
  const high = area.high_ft == null ? null : mapLevel(area.high_ft);
  return {
    title: hazard ? `${kind} · ${hazard}` : kind,
    altitudes: high ? `${low} to ${high}` : area.low_ft != null ? `${low} and up` : null,
  };
}

/** Whether a point is inside an area's outline ([lat, lon] pairs), by
 *  the even-odd rule: areas are a few hundred miles across, near enough
 *  flat for it. */
export function inside(point: LatLon, ring: number[][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i] as [number, number],
      [yj, xj] = ring[j] as [number, number];
    if (yi > point.lat !== yj > point.lat && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** How the route crosses an area: the miles of it inside (the course line
 *  walked a mile at a time), and whether the planned altitude is under,
 *  in or over its altitudes there; null where it does not cross. */
export function routeThrough(
  geo: Geo,
  area: WeatherArea,
  line: [number, number][],
  altitudeFt: number | null,
): { nm: number; relation: "below" | "in" | "above" | null } | null {
  let nm = 0;
  for (let i = 1; i < line.length; i++) {
    const a = { lat: line[i - 1]![0], lon: line[i - 1]![1] },
      b = { lat: line[i]![0], lon: line[i]![1] };
    const length = geo.distanceNm(a, b),
      course = geo.bearingDeg(a, b);
    for (let s = 0.5; s < length; s += 1) if (inside(geo.destination(a, course, s), area.coords)) nm += Math.min(1, length - s + 0.5);
  }
  if (nm < 0.5) return null;
  if (altitudeFt == null || area.from_freezing_level) return { nm, relation: null };
  const low = area.low_ft ?? -Infinity,
    high = area.high_ft ?? Infinity;
  return { nm, relation: altitudeFt < low ? "below" : altitudeFt > high ? "above" : "in" };
}

/** A pilot report's mark: what it met, worst first -- urgent, turbulence,
 *  icing, else the sky -- and its altitude in hundreds of feet, as a
 *  PIREP writes it ("065"). */
export function pirepMark(p: MapPirep): { glyph: string; colour: string; level: string } {
  const level = p.altitude_ft == null ? "---" : hundreds(p.altitude_ft);
  if (p.urgent) return { glyph: "!", colour: WEATHER.urgent, level };
  if (p.turbulence && !/NEG|NONE/i.test(p.turbulence)) return { glyph: "⌁\uFE0E", colour: WEATHER.turbulence, level };
  if (p.icing && !/NEG|NONE/i.test(p.icing)) return { glyph: "❄\uFE0E", colour: WEATHER.icing, level };
  return { glyph: "☁\uFE0E", colour: WEATHER.ash, level };
}
