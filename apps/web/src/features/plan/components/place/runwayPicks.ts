import type { AirportPlace } from "../../../../lib/api/types";
import { diagramRunwaysPicture } from "../../../../lib/diagram";

type Runway = AirportPlace["runways"][number];

/** The longest runway open, what a pilot sizes a field by: the Runways
 *  tab's badge and the fact strip's Longest. Closed ones (NASR's, or a
 *  NOTAM's the caller has marked closed) and ones of no surveyed length
 *  left out; none where none is left. */
export function longestOpen<R extends Pick<Runway, "closed" | "length_ft">>(runways: readonly R[]): R | null {
  const open = runways.filter((r) => !r.closed && r.length_ft != null);
  return open.length ? open.reduce((a, b) => (b.length_ft! > a.length_ft! ? b : a)) : null;
}

/** Whether the FAA's diagram cropped to the runways can be drawn: the
 *  field has one, the planner did not say it cannot be cropped (WEB-41),
 *  and it has not failed to load here. */
export const runwaysPictureOf = (place: AirportPlace, failed: boolean) =>
  place.airport_diagram_cycle && place.airport_diagram_runways !== false && !failed
    ? diagramRunwaysPicture(place.ident, place.airport_diagram_cycle)
    : null;
