import { useMemo } from "react";
import type { Candidate, Course, Leg, NavLogAltitude, SaveFlightRequest, Totals } from "../../../../lib/api/types";
import { withoutAltitude } from "../../../../lib/identSchema";
import { useRisk } from "../../../../lib/frat";
import { navLogRows, savedCheckpoints } from "../navlog/rows";

// What Save files, apart from the menu items that file it (SaveFlight):
// the flight watch saves the same request without drawing a Save item.

/** The flights saved, one mutation key for every Save item
 *  (SaveFlightButton) and the flight watch's save (FlightWatch). */
export const SAVE_FLIGHT = ["saveFlight"];

/** A plan as Save compares it: the same plan with its risk assessment
 *  made again is not another (SaveFlightButton). */
export const planOf = (r: SaveFlightRequest) => JSON.stringify({ ...r, risk: null });

/** The plan on screen as a flight to save: what Save files, and what a
 *  solo cross-country's review is asked of (ReviewAskSheet). */
export interface FlightToSave {
  course: Course | null;
  totals: Totals | null;
  nav: NavLogAltitude | null;
  legs: Leg[];
  selected: Candidate[];
  /** The airplane the nav log was computed for: a pilot's own, or
   *  null for a stock profile. */
  aircraftId: number | null;
  /** The departure time as an ISO instant, or "" -- what the saved
   *  flight is planned for. */
  depart: string;
  /** The altitudes the pilot set at points of the route, as the URL's
   *  `altitudes` writes them ("VPBNG:4500"), or "": filed with the
   *  flight, so opened again it is planned at them. */
  altitudes?: string;
  /** The address's other picks for the flight (lib/flightLink picksOf):
   *  filed too, so it opens again as it was planned. */
  picks?: string;
}

/** What would be filed, and only once there is a whole plan to file: the
 *  course (the airports' own idents and places, not a route being
 *  switched to), the nav log and its totals. Save used to be offered
 *  mid-stream, or after a stream failed, and filed null totals. */
export function useSaveRequest({ course, totals, nav, legs, selected, aircraftId, depart, altitudes = "", picks = "" }: FlightToSave): SaveFlightRequest | null {
  // The briefing's risk assessment (lib/frat), filed with the flight.
  const risk = useRisk(s => s.assessment);
  return useMemo((): SaveFlightRequest | null => {
    if (!course || !nav || !totals) return null;
    return {
      aircraftId,
      // A present position without the moment's altitude (withoutAltitude).
      departureIdent: withoutAltitude(course.departure.ident),
      destinationIdent: course.destination.ident,
      stops: (course.stops ?? []).map(stop => stop.ident),
      cruiseAltitudeFt: nav.altitude_ft,
      totalDistanceNm: totals.distance_nm,
      totalEteMin: totals.ete_min,
      totalFuelGal: totals.fuel_gal,
      plannedFor: depart || null,
      // The nav log's own rows (navLogRows), as the checkpoints Spring files.
      checkpoints: savedCheckpoints(navLogRows(course, selected, legs), course.distance_nm),
      risk: risk ? { score: risk.score, level: risk.level, factors: risk.factors.map(f => f.label) } : null,
      altitudes: altitudes || null,
      picks: picks || null,
    };
  }, [course, nav, totals, aircraftId, depart, selected, legs, risk, altitudes, picks]);
}
