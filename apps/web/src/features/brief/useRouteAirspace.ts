import { useQuery } from "@tanstack/react-query";
import type { Leg, NavLogAltitude } from "../../lib/api/types";
import { liveWhen, saaQuery } from "../../lib/liveReports";
import { passTime, suaWhen, type SuaWhen } from "../plan/lazy";

/**
 * Where the route meets the special-use areas, and when the flight is
 * there: `depart` is the departure picked, or the time the page was opened
 * for "Now". Which TFRs the route crosses in force is the engine's
 * (gonogo_route_figures, useFlightBriefing), the planner's very copy.
 */
export function useRouteAirspace({ nav, legs, depart }: { nav: NavLogAltitude | null; legs: Leg[]; depart: string }) {
  const passAt = (alongNm: number) => passTime(legs, depart, alongNm);
  // The special-use areas the legs cross (wingtip.sua, with the altitudes),
  // and their times of use read for when the flight passes each, in the
  // area's own time zone.
  // Where SFDPS says an area is active or cold now, at the pass, that is
  // its word instead (lib/liveReports), the FAA's own and newer than the
  // chart's times of use.
  const { data: saaNow } = useQuery(saaQuery((nav?.altitude_selection.special_use ?? []).map((area) => area.name)));
  const specialUse = (nav?.altitude_selection.special_use ?? []).map((area) => {
    const pass = passAt(area.along_track_nm);
    const scheduled = pass ? suaWhen(area.times_of_use, pass, area.time_zone) : ("unknown" as SuaWhen);
    return { area, pass, when: liveWhen(scheduled, saaNow?.areas[area.name], pass) };
  });
  return { passAt, specialUse };
}
