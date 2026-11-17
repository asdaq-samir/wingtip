import { useMemo } from "react";
import { useAirplaneChosen } from "../../../lib/preferences";
import { useKeepOffline } from "../../plan-map";
import { useAircraftPick } from "../../aircraft-pick";
import { useRouteWays, usePlan, type PlanParams, usePlanSetters } from "../../plan";
import type { PlanRoute } from "./usePlanRoute";

/**
 * The plan for the route (usePlanWorkspace): the airplane it is planned
 * for (useAircraftPick), FPL's Routes asked for before it (useRouteWays),
 * the planner's answer (usePlan, `s`) with the course timed on the ground
 * at the stops, the route's own figures for the Routes' line, and the
 * address's one-change settings that plan again (usePlanSetters).
 */
export function usePlanAnswer({ planned, depart, local, flightRules, ground, planInputs, setAddress }: PlanRoute) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  // The airplane the nav log is computed for (useAircraftPick).
  const { profiles, aircraft, aircraftValue, aircraftChoices, changeAircraft, pickTail } = useAircraftPick();
  const planParams: PlanParams = { ...planInputs, aircraft };
  const s = usePlan(planParams);
  // The route as planned's highest cruise altitude, its legs': where it
  // enters Class B there the Routes offer Avoid Class B (14 CFR
  // 91.131(a)(1)); none before the plan.
  const altitudeFt = s.legs.length ? Math.max(...s.legs.map((leg) => leg.altitude_ft)) : null;
  // FPL's Routes (useRouteWays), asked for before the plan, and again at
  // its altitude once it is planned.
  const ways = useRouteWays({ planned, aircraft, depart, local, flightRules, altitudeFt });
  // The route's own time and miles: its nav log's once it is planned,
  // the grid's and the course's before (its weather strip's minutes).
  // The grid's minutes are its weather timing's, at a speed the planner
  // takes for the weather alone: a time on the route only with an airplane
  // picked, as the FPL figures and the nav log say none without one (the
  // owner, 2026-11-08: "don't assume"; the UI audit's A3, "13h 38m" on the
  // chart beside ETE "—").
  const airplane = useAirplaneChosen();
  const gridOwnMin = airplane ? (ways.routeWays?.current_along?.bands ?? []).reduce((sum, b) => sum + b.min, 0) : 0;
  // And its minutes on the ground at the fields it lands at (`ground`,
  // else the owner's 30), as the ways count theirs: the nav log's totals
  // are air time alone, and the route as typed read shorter than a way through
  // the same stop (the audit of 2026-10-24).
  const own = {
    minutes: s.totals?.ete_min ?? (gridOwnMin || null),
    nm: s.totals?.distance_nm ?? s.course?.distance_nm ?? null,
    gal: s.totals?.fuel_gal ?? null,
    altitudeFt,
    ground: (s.course?.stops ?? []).filter((stop) => stop.kind !== "fix").reduce((sum, stop) => sum + (ground[stop.ident] ?? 30), 0),
  };
  // The address's one-change settings (usePlanSetters), a Direct To worked out on the device offline.
  const setters = usePlanSetters(setAddress, s);
  // The course with each stop's time on the ground, so every row built
  // from it (navLogRows) is timed from when the airplane leaves again.
  const course = useMemo(() => (s.course ? { ...s.course, ground } : null), [s.course, ground]);
  // Keep Charts Offline, the setting: each route loaded keeps its charts.
  useKeepOffline(course);
  return {
    s,
    selected: s.selected,
    course,
    planParams,
    ways,
    own,
    profiles,
    aircraft,
    aircraftValue,
    aircraftChoices,
    changeAircraft,
    pickTail,
    ...setters,
  };
}

/** The plan for the route, as the workspace's hooks read it. */
export type PlanAnswerModel = ReturnType<typeof usePlanAnswer>;
