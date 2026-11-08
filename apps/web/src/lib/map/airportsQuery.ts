import { api } from "../api/client";
import type { Box } from "./view";

/** From this zoom, the whole country on a phone, the fields that report
 *  wear their weather: the farthest the overlay tiles draw an airport
 *  (glOverlays' AIRPORTS_FARTHEST_ZOOM). */
const FARTHEST_ZOOM = 4;

/** The most fields the planner answers with at once. */
const AIRPORTS_LIMIT = 1000;

/** The METARs the overlay tiles' fields wear their weather from
 *  (AirportsGl), the fields themselves being in the tiles: the planner
 *  asked for a box's fields that report, from FARTHEST_ZOOM in. Up to a
 *  thousand, the box being some nine views: the planner's most, 270 in
 *  two degrees by two and a half round Chicago in 0.14 s. Ten minutes, as
 *  a METAR's colour can change by the hour. */
export function airportsQuery(asked: Box, zoom: number) {
  return {
    queryKey: ["airportsInView", asked.key, true],
    queryFn: () => api.airportsInView({ ...asked.box, reporting: true, limit: AIRPORTS_LIMIT }),
    enabled: zoom >= FARTHEST_ZOOM,
    staleTime: 10 * 60_000,
    meta: { silent: true },
  };
}
