import { useEffect, useMemo, useEffectEvent } from "react";
import { checkpointsQuery, courseQuery, queryClient } from "../../../lib/queryClient";
import { navlogQuery } from "./usePlan";
import { suggestedStopAt } from "./planAddress";
import { useSuggestedStops, withStopsAfter } from "./useSuggestedStops";
import { useMapActions } from "./useMapActions";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";
import type { PlanCards } from "./usePlanCards";
import type { PlanPicks } from "./usePlanPicks";

/**
 * The stops the planner suggests and keeping them (useSuggestedStops), the
 * route through them planned ahead of the tap, and what the map's cards
 * and the radio do to the route (useMapActions), for usePlanWorkspace.
 */
export function usePlanStops(route: PlanRoute, answer: PlanAnswerModel, { place }: PlanCards, { typeProcedures }: PlanPicks) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  const { planned, setStops, setRoute, acceptClassB, flyAltitude, load, showWaypoints, address } = route;
  const { s, course, aircraft, planParams, directToChartPoint } = answer;
  // The stops the planner suggests, and keeping them (useSuggestedStops).
  const suggested = useSuggestedStops({ totals: s.totals, local: s.local, planned, setStops });
  const { fuelStops, keepFuelStops } = suggested;
  // The first flight's suggested fuel stops, offered where the route's fuel
  // says it is short (FlightLine), as the route box offers them.
  const firstFuelStop = useMemo(() => {
    const first = fuelStops[0];
    if (!first || !first.stops.length) return null;
    const idents = first.stops.map((stop) => stop.ident);
    return { idents, add: () => keepFuelStops(first.departure, idents) };
  }, [fuelStops, keepFuelStops]);
  // The route through the first flight's suggested stops planned as they
  // are suggested, as Fly Here's is at its tap: Add fuel stop then draws it
  // at once from what is in, where the owner watched four and a half
  // seconds of dashes and "Planning altitudes…" after the tap (the video,
  // 2026-10-22). The same plan the page asks for once they are stops.
  const suggestedFirst = fuelStops[0];
  const nextStops =
    suggestedFirst && !s.local
      ? (withStopsAfter(
          planned.dep,
          planned.stops,
          suggestedFirst.departure,
          suggestedFirst.stops.map((f) => f.ident),
        )?.stops ?? null)
      : null;
  const aheadKey = nextStops
    ? JSON.stringify([nextStops, planParams.altitudeFt, planParams.altitudeChoice, planParams.depart, aircraft.profile, load])
    : "";
  const prefetchAhead = useEffectEvent(() => {
    if (!nextStops) return;
    const ahead = { ...planParams, stops: nextStops };
    void queryClient.prefetchQuery(courseQuery(ahead.dep, ahead.dest, nextStops));
    if (showWaypoints) void queryClient.prefetchQuery(checkpointsQuery(ahead.dep, ahead.dest, nextStops));
    void queryClient.prefetchQuery(navlogQuery(ahead, showWaypoints));
  });
  useEffect(() => prefetchAhead(), [aheadKey]); // keyed on the route and the plan's choices
  // The map's cards' and the radio's actions on the route (useMapActions).
  useMapActions({
    course,
    planned,
    aircraft,
    classBAvoided: !address.class_b,
    setStops,
    setRoute,
    directToChartPoint,
    acceptClassB,
    flyAltitude,
    typeProcedures,
  });
  return {
    ...suggested,
    // The suggested stop the airport's card is open on, where it is one: its
    // figures at the card's top, and Add Stop keeps it at its place
    // (PlaceCard's `stop`).
    suggestedAt: suggestedStopAt(place, fuelStops),
    firstFuelStop,
  };
}
