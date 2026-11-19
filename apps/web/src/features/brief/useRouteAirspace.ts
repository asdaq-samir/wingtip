import { useQuery } from "@tanstack/react-query";
import type { Briefing, Leg, NavLogAltitude } from "../../lib/api/types";
import { liveWhen, saaQuery } from "../../lib/liveReports";
import { passTime, suaWhen, tfrWhen, type SuaWhen } from "../plan/lazy";

/**
 * Where the route meets the TFRs and the special-use areas, and when the
 * flight is there: `depart` is the departure picked, or the time the page was
 * opened for "Now".
 */
export function useRouteAirspace({
  briefing,
  nav,
  legs,
  depart,
}: {
  briefing: Briefing | null;
  nav: NavLogAltitude | null;
  legs: Leg[];
  depart: string;
}) {
  const passAt = (alongNm: number) => passTime(legs, depart, alongNm);
  // The TFRs the route goes through while they are in force: in force
  // when the flight gets there (half an hour either way) -- the planner's
  // word on it where it placed the TFR on the legs (on_route) -- or at
  // some time during the flight where that time is not known yet.
  const tfrInForce = (t: Briefing["tfrs"][number]) => {
    if (t.on_route?.when) return t.on_route.when === "during";
    const pass = passAt(t.along_track_nm);
    return !pass || tfrWhen(t, pass) === "in-force";
  };
  const tfrsCrossed = briefing?.tfrs.filter((t) => t.crosses && tfrInForce(t)) ?? [];
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
  return { passAt, tfrInForce, tfrsCrossed, specialUse };
}
