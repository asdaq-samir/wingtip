import type { AirportPlace } from "../../lib/api/types";
import type { PageMark } from "../../lib/diagram";
import { callEngine } from "../../lib/engine/engine";
import type { RunwayProximityAnswer } from "../../lib/engine/contract";
import type { Fix } from "../../lib/map/position/ownShip";
import type { DiagramText } from "./diagramText";

/**
 * Own ship and the hot spots on the FAA's airport diagram, and the runway
 * proximity advisor's answer, each the engine's (route's diagram rules,
 * wording's runway_proximity): this module only hands the page's words,
 * the field and the fix across.
 */

export type Graticule = NonNullable<ReturnType<typeof graticuleOf>>;

/** How the page and the ground match, by the page's own latitude and
 *  longitude labels; null for a diagram with none (KORD's). */
export function graticuleOf(page: DiagramText) {
  return callEngine("diagram_graticule", { labels: page.items });
}

/** A hot spot on the page and the ground: its name ("HS 1"), its place
 *  as fractions of the page, and on the ground. */
export interface Spot {
  name: string;
  x: number;
  y: number;
  lat: number;
  lon: number;
}

/** The diagram's hot spots, by their labels, placed by the graticule. */
export function hotSpotsOf(page: DiagramText, graticule: Graticule | null): Spot[] {
  if (!graticule) return [];
  return callEngine("diagram_hot_spots", { graticule, labels: page.items }).map((s) => ({
    ...s,
    x: s.x / page.width,
    y: s.y / page.height,
  }));
}

/** A fix's age, s, at `now` (ms). */
const ageOf = (fix: Fix, now: number) => Math.max(0, (now - fix.at) / 1000);

/** Own ship on the page, or null: a fix good to AC 120-76D's 30 m and
 *  no older than its 3 s (diagram_fix_usable), placed by the graticule
 *  and on the page; turned by the page's north and the track, or a
 *  circle with no track (11.17.2.2). */
export function markOf(fix: Fix | null, page: DiagramText, graticule: Graticule | null, now: number): PageMark | null {
  if (!fix || !graticule) return null;
  if (!callEngine("diagram_fix_usable", { age_s: ageOf(fix, now), accuracy_m: fix.accuracyM })) return null;
  const at = callEngine("diagram_point", { graticule, lat: fix.lat, lon: fix.lon, width: page.width, height: page.height });
  if (!at.on_page) return null;
  const track = fix.speedKt ? fix.headingDeg : null;
  return {
    x: at.x / page.width,
    y: at.y / page.height,
    rotationDeg: track == null ? null : graticule.north_deg + track,
    moving: track != null,
  };
}

/** The advisor's answer for the fix at the field, or null with no fix.
 *  The browser's height is above the WGS-84 ellipsoid (W3C Geolocation
 *  9.2), about 100 ft under MSL in the contiguous US (the geoid's -30 m):
 *  the airplane reads lower, which keeps the surface's prompts on. */
export function adviceOf(fix: Fix | null, place: AirportPlace, spots: Spot[], now: number): RunwayProximityAnswer | null {
  if (!fix) return null;
  return callEngine("runway_proximity", {
    fix: {
      lat: fix.lat,
      lon: fix.lon,
      age_s: ageOf(fix, now),
      accuracy_m: fix.accuracyM,
      track_deg: fix.headingDeg,
      groundspeed_kt: fix.speedKt,
      altitude_ft: fix.altitudeFt,
    },
    elevation_ft: place.elevation_ft ?? null,
    pattern_agl_ft: place.pattern?.published ? place.pattern.agl_ft : null,
    runways: place.runways.map((r) => ({ width_ft: r.width_ft, closed: r.closed, runway_ends: r.runway_ends ?? [] })),
    hot_spots: spots.map((s) => ({ name: s.name, lat: s.lat, lon: s.lon })),
  });
}
