import { useEffect, useEffectEvent } from "react";
import { airportQuery, checkpointsQuery, courseQuery, queryClient } from "../../../lib/queryClient";
import { navlogQuery, suggestedStopAt } from "../../plan";
import { useSuggestedStops } from "../../stops";
import { useMapActions } from "../../route";
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
  const { planned, setStops, setRoute, flyAltitude, load, showWaypoints } = route;
  const { s, course, aircraft, planParams, directToChartPoint } = answer;
  // The stops the planner suggests, and keeping them (useSuggestedStops).
  const suggested = useSuggestedStops({ totals: s.totals, local: s.local, planned, setStops });
  const { fuelStops, fuelToAdd } = suggested;
  // The route through every flight's suggested stops planned as they are
  // suggested, as Fly Here's is at its tap: Add Fuel Stops then draws it
  // at once from what is in, where the owner watched four and a half
  // seconds of dashes and "Planning altitudes…" after the tap (the video,
  // 2026-10-22). The same plan the page asks for once they are stops, and
  // the one whose own suggestions Add Fuel Stops reads next.
  const nextStops = !s.local ? (fuelToAdd?.stops ?? null) : null;
  const aheadKey = nextStops
    ? JSON.stringify([nextStops, planParams.altitudeFt, planParams.altitudeChoice, planParams.depart, aircraft.profile, load])
    : "";
  const prefetchAhead = useEffectEvent(() => {
    if (!nextStops) return;
    const ahead = { ...planParams, stops: nextStops };
    void queryClient.prefetchQuery(courseQuery(ahead.dep, ahead.dest, nextStops));
    if (showWaypoints) void queryClient.prefetchQuery(checkpointsQuery(ahead.dep, ahead.dest, nextStops));
    void queryClient.prefetchQuery(navlogQuery(ahead, showWaypoints));
    // And the new stops' cards, whose reports their runways are picked into
    // the wind from as they land in the route: in by then, not asked after.
    for (const ident of nextStops) void queryClient.prefetchQuery(airportQuery(ident));
  });
  useEffect(() => prefetchAhead(), [aheadKey]); // keyed on the route and the plan's choices
  // The map's cards' and the radio's actions on the route (useMapActions).
  useMapActions({ course, planned, aircraft, setStops, setRoute, directToChartPoint, flyAltitude, typeProcedures });
  return {
    ...suggested,
    // The suggested stop the airport's card is open on, where it is one: its
    // figures at the card's top, and Add Stop keeps it at its place
    // (PlaceCard's `stop`).
    suggestedAt: suggestedStopAt(place, fuelStops),
  };
}
