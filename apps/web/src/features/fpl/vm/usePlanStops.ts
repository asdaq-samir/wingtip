import { useEffect, useEffectEvent, useMemo } from "react";
import { airportQuery, queryClient } from "../../../lib/queryClient";
import { prefetchRoute, suggestedStopAt } from "../../plan";
import { useSuggestedStops } from "../../stops";
import { fuelStopsAt, useMapActions, waypointStopsOf } from "../../route";
import { sameField } from "../../../lib/procedures";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";
import type { PlanCards } from "./usePlanCards";
import type { PlanPicks } from "./usePlanPicks";
import { useKept } from "./useKept";

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
  // 2026-10-22). The same plan the page asks for once they are stops, which
  // the planner made already to check them (wingtip.fuel_rounds).
  const nextStops = !s.local ? (fuelToAdd?.stops ?? null) : null;
  const aheadKey = nextStops
    ? JSON.stringify([nextStops, planParams.altitudeFt, planParams.altitudeChoice, planParams.depart, aircraft.profile, load])
    : "";
  const prefetchAhead = useEffectEvent(() => {
    if (!nextStops) return;
    prefetchRoute({ ...planParams, stops: nextStops }, showWaypoints);
    // And the new stops' cards, whose reports their runways are picked into
    // the wind from as they land in the route: in by then, not asked after.
    for (const ident of nextStops) void queryClient.prefetchQuery(airportQuery(ident));
  });
  useEffect(() => prefetchAhead(), [aheadKey]); // keyed on the route and the plan's choices
  // The map's cards' and the radio's actions on the route (useMapActions).
  useMapActions({ course, planned, aircraft, setStops, setRoute, directToChartPoint, flyAltitude, typeProcedures });
  // The suggested stop the airport's card is open on, where it is one: its
  // figures at the card's top, and Add Stop keeps it at its place
  // (PlaceCard's `stop`) -- after the point its flight leaves, by that
  // point's place in the route (fuelStopsAt, by both the flight's ends; the
  // stops flown through the box's own waypointStopsOf, airways too), so a
  // field the route leaves twice takes it on the right flight.
  const at = useMemo(() => suggestedStopAt(place, fuelStops), [place, fuelStops]);
  const points = [planned.dep, ...planned.stops, planned.dest];
  const fixes = waypointStopsOf(planned.stops, course);
  const flightAt = at
    ? fuelStopsAt(points, fixes, fuelStops).findIndex(
        (f) => !!f && [...f.stops, ...(f.choices ?? [])].some((c) => sameField(c.ident, place!)),
      )
    : -1;
  const after = !at
    ? -1
    : flightAt >= 0
      ? flightAt
      : Math.max(
          0,
          points.findIndex((p) => sameField(p, at.after)),
        );
  const atStop = at ? at.stop : null;
  // The same object while the stop and its place are (useMemo), and the
  // slice while nothing in it changes (useKept), as each slice is.
  const suggestedAt = useMemo(() => (atStop ? { stop: atStop, after } : null), [atStop, after]);
  return useKept({ ...suggested, suggestedAt });
}
