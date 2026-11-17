import type { AirportPlace } from "../../lib/api/types";
import { diagramRunwaysPicture } from "../../lib/diagram";
import type { NotamMarks } from "./notamBadges";

type Runway = AirportPlace["runways"][number];

/** The longest runway open, what a pilot sizes a field by: the Runways
 *  tab's badge and the fact strip's Longest. Closed ones (NASR's, or a
 *  NOTAM's the caller has marked closed) and ones of no surveyed length
 *  left out; none where none is left. */
export function longestOpen<R extends Pick<Runway, "closed" | "length_ft">>(runways: readonly R[]): R | null {
  const open = runways.filter((r) => !r.closed && r.length_ft != null);
  return open.length ? open.reduce((a, b) => (b.length_ft! > a.length_ft! ? b : a)) : null;
}

/** The field's runways, closed where the FAA's data has them closed or a
 *  NOTAM in force shuts them to landing and takeoff (the engine's
 *  notam_subject badge, severity "unusable"): the Runways tab's rows and
 *  badges and the pictures' sketch read the one list, so a runway the tab
 *  says is Closed is drawn closed (UI audit A5, 2026-11-17). */
export function withNotamClosures<R extends Pick<Runway, "closed">>(runways: readonly R[], marks: Pick<NotamMarks, "runway">): R[] {
  return runways.map((r, i) => (marks.runway.get(i)?.severity === "unusable" ? { ...r, closed: true } : r));
}

/** Whether the FAA's diagram cropped to the runways can be drawn: the
 *  field has one, the planner did not say it cannot be cropped (WEB-41),
 *  and it has not failed to load here. */
export const runwaysPictureOf = (place: AirportPlace, failed: boolean) =>
  place.airport_diagram_cycle && place.airport_diagram_runways !== false && !failed
    ? diagramRunwaysPicture(place.ident, place.airport_diagram_cycle)
    : null;
