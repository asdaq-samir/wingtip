import { useCallback, useEffect, useMemo } from "react";
import type { SetURLSearchParams } from "react-router";
import type { AircraftChoice } from "../../../lib/api/types";
import { NO_PLAN, useBriefPlan } from "../../../lib/briefPlan";
import { picksOf } from "../../../lib/flightLink";
import { identOf } from "../../../lib/identSchema";
import { patched } from "../../../lib/useSearchParamsNow";
import { useWindPicks } from "../lib/windPicks";
import { useAsk } from "../../../lib/ask/useAsk";
import { useTabAsk } from "../components/navlog/panelTab";
import { briefingLegs } from "./briefingLegs";
import type { PlannedRoute } from "./planAddress";
import type { PlanAnswer, PlanCourse } from "./planTypes";
import type { useRouteEdits } from "./useRouteEdits";

type RouteEdits = ReturnType<typeof useRouteEdits>;

/**
 * The plan as a flight to save and file (usePlanWorkspace): Save's, the
 * solo cross-country review's and the Brief's Flight Plan; the flight as
 * the Brief reads it (lib/briefPlan) for its Ask, its words and its watch;
 * and the assistant's proposed changes applied through the route's own
 * setters.
 */
export function useFlightToSave({
  s,
  planned,
  routed,
  course,
  aircraft,
  depart,
  altitudes,
  localMin,
  searchParams,
  setSearchParams,
  setRoute,
  flyAltitude,
  changeDepart,
}: {
  s: PlanAnswer;
  planned: PlannedRoute;
  routed: boolean;
  course: PlanCourse | null;
  aircraft: AircraftChoice;
  depart: string;
  /** Points' own altitudes, as the address has them (`altitudes`). */
  altitudes: string;
  /** A local flight's time aloft, in minutes. */
  localMin: number;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  setRoute: RouteEdits["setRoute"];
  flyAltitude: RouteEdits["flyAltitude"];
  changeDepart: (iso: string) => void;
}) {
  // The flight plan filed: the Brief's Flight Plan, where the FAA's form
  // is filled in from the plan and sent where Flight Service is connected
  // -- all the way up, the panel the form's room. Only where the Brief has
  // one: a route from an airport, its nav log in.
  const fileable = !!identOf(planned.dep) && !!s.totals;
  const fileFlightPlan = useCallback(() => {
    setSearchParams((prev) => patched(prev, { brief: "1" }), { replace: true });
    // The Brief's own card all the way up for the form (PanelTabs).
    useTabAsk.getState().go("preflight", "Flight Plan", true);
  }, [setSearchParams]);

  // The plan as a flight to save: Save's, and the solo cross-country
  // review's, which saves it as it asks.
  // A route from a present position too: the gateway files one (V17), as
  // Fly Here's Direct-To in the air starts. Not the route as entered,
  // whose checkpoints' log comes in its place: saved then, it filed a
  // flight with none, and Save was offered again as the log changed under it.
  // Offered once the plan has settled: no stage still being planned, and
  // the runways into the wind picked -- they plan the route again with
  // their patterns flown, and a Save before them filed the plan before
  // them (the owner's yes, 2026-10-28; features/plan/lib/windPicks). Nor while the log
  // on screen is the one before a new runway or altitude, held there till
  // its own is in (usePlan's `replanning`): its stage is not said, and a
  // Save then filed the plan being replaced.
  const windPending = useWindPicks((w) => w.pending);
  const settledPlan = s.stage === null && !s.replanning && !windPending;
  const flightToSave = {
    course: routed && settledPlan ? course : null,
    totals: s.pointToPoint ? null : s.totals,
    nav: s.nav,
    legs: s.legs,
    selected: s.logSelected,
    aircraftId: aircraft.aircraftId ?? null,
    depart,
    altitudes,
    picks: picksOf(searchParams),
  };
  // The flight as the Brief reads it (lib/briefPlan), for its Ask, its
  // words and its watch, which draw outside the route's props: the
  // route and its time, the airplane, the nav log's altitude, time en
  // route and legs (as the briefing is asked with them), and the plan as
  // Save files it. Cleared as the workspace goes.
  const briefLegs = useMemo(() => briefingLegs(course, s.logSelected, s.legs), [course, s.logSelected, s.legs]);
  const eteMin = s.local ? localMin : (s.totals?.ete_min ?? null);
  // The altitude flown, the nav log's (the address's `altitude_ft` is the
  // pilot's own as typed, a string).
  const flownFt = s.nav?.altitude_ft ?? null;
  const flightCourse = flightToSave.course;
  useEffect(() => {
    useBriefPlan
      .getState()
      .set({
        dep: planned.dep,
        dest: planned.dest,
        stops: planned.stops,
        aircraft: aircraft.profile || null,
        altitudeFt: flownFt,
        depart,
        eteMin,
        legs: briefLegs ? { fixes: briefLegs.fixes, legMin: briefLegs.legMin } : null,
        routed,
        local: !!s.local,
        flight: {
          course: flightCourse,
          totals: flightToSave.totals,
          nav: s.nav,
          legs: s.legs,
          selected: s.logSelected,
          aircraftId: aircraft.aircraftId ?? null,
          depart,
          altitudes,
          picks: flightToSave.picks,
        },
      });
  }, [
    planned.dep,
    planned.dest,
    planned.stops,
    aircraft.profile,
    aircraft.aircraftId,
    flownFt,
    depart,
    eteMin,
    briefLegs,
    routed,
    s.local,
    flightCourse,
    flightToSave.totals,
    s.nav,
    s.legs,
    s.logSelected,
    altitudes,
    flightToSave.picks,
  ]);
  useEffect(() => () => useBriefPlan.getState().set(NO_PLAN), []);
  // A change the assistant proposes (useAsk's actions), applied at the
  // pilot's tap through the route box's own setters -- the route, the
  // altitude flown, the departure time -- each a change of the address,
  // which plans again. Registered while the workspace is up; the chip
  // applies nothing otherwise.
  useEffect(() => {
    useAsk.setState({
      applyChange: (change) => {
        if (change.dep !== undefined || change.dest !== undefined || change.stops !== undefined) {
          setRoute({ dep: change.dep ?? planned.dep, stops: change.stops ?? planned.stops, dest: change.dest ?? planned.dest });
        }
        if (change.altitude_ft !== undefined) flyAltitude(change.altitude_ft);
        if (change.depart !== undefined) changeDepart(change.depart);
      },
    });
    return () => useAsk.setState({ applyChange: null });
  }, [setRoute, flyAltitude, changeDepart, planned.dep, planned.stops, planned.dest]);
  return { fileable, fileFlightPlan, flightToSave };
}
