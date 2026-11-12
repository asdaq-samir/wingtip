import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api/client";
import type { AircraftChoice } from "../../../lib/api/types";
import { aircraftKey } from "../../../lib/aircraftChoice";
import { planHrefOf, recentHrefOf } from "../../../lib/flightLink";
import { altitudesOf, altitudesParam, routeOf, stopsOf } from "../../../lib/identSchema";
import { usePreferences } from "../../../lib/preferences";
import { chartCycle, courseQuery, flightsQuery, queryClient } from "../../../lib/queryClient";
import { sameStops } from "../lib/routeWays";
import { loadAddress } from "../../../lib/address";
import type { PlannedRoute } from "./planAddress";
import { navlogQuery, type PlanParams } from "./usePlan";

/** How many of the latest Recents, and of Saved, are planned ahead. */
const PLANNED_AHEAD = 3;

/**
 * The latest Recents and Saved planned ahead by the planner
 * (usePlanWorkspace), one at a time once the page is idle and the route
 * on screen is in: the chart's read along each, the ground under it and
 * the altitude for the airplane and the hour kept there, the slow part of
 * a route's plan (2 to 4 s for a route's first checkpoints) -- the owner,
 * 2026-10-28: "Why isn't planning instant?". Not kept in the page: a
 * route opened with its whole plan in the cache was drawn in one go,
 * nothing on screen for 1.9 to 3.3 s at 4x a phone's, where one asked for
 * afresh showed its figures, worked out in the browser, in half a second
 * and the planner's soon after (three routes each way, 2026-10-28). Each
 * as the page will ask for it, with the picks the address keeps for the
 * altitude.
 */
export function usePlanAhead({
  planSettled,
  planned,
  aircraft,
  load,
  showWaypoints,
  flightRules,
}: {
  /** The route on screen is in (or there is none). */
  planSettled: boolean;
  planned: PlannedRoute;
  aircraft: AircraftChoice;
  load: number;
  showWaypoints: boolean;
  flightRules: PlanParams["rules"];
}) {
  const recentRoutes = usePreferences((p) => p.recentRoutes);
  const { data: savedFlights } = useQuery({ ...flightsQuery, enabled: false });
  const aheadRoutes = useMemo(
    () => [
      ...new Set([
        ...recentRoutes.slice(0, PLANNED_AHEAD).map(recentHrefOf),
        ...(savedFlights ?? []).slice(0, PLANNED_AHEAD).map((f) => planHrefOf(f)),
      ]),
    ],
    [recentRoutes, savedFlights],
  );
  const plannedAhead = useRef(new Set<string>());
  useEffect(() => {
    if (!planSettled || aheadRoutes.length === 0) return;
    // Not on a connection the pilot asked to spare.
    if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
    let gone = false;
    const idle = window.requestIdleCallback ?? ((go: () => void) => window.setTimeout(go, 2000));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(async () => {
      for (const href of aheadRoutes.slice(0, PLANNED_AHEAD * 2)) {
        // Read as the page reads its own address (lib/address), so the plan
        // asked for ahead is the one the page will ask for.
        const q = loadAddress(href.split("?")[1] ?? "");
        const dep = q.dep ?? "",
          dest = q.dest ?? "";
        const via = stopsOf(q.stops);
        const mark = [href, aircraftKey(aircraft), load, showWaypoints, flightRules].join("|");
        if (gone) return;
        if (plannedAhead.current.has(mark) || !routeOf(dep, dest, via) || (dep === dest && via.length === 0)) continue;
        if (dep === planned.dep && dest === planned.dest && sameStops(via, planned.stops)) continue;
        plannedAhead.current.add(mark);
        const plan: PlanParams = {
          dep,
          dest,
          stops: via,
          altitudeFt: q.altitude_ft?.toString() ?? "",
          altitudeNearest: q.altitude_nearest,
          altitudeChoice: q.altitude_choice,
          depart: q.depart ?? "",
          aircraft,
          load,
          classBClearance: q.class_b,
          altitudes: altitudesParam(altitudesOf(q.altitudes)),
          checkpoints: showWaypoints,
          rules: flightRules,
        };
        // Asked for and let go, the page's cache as it was.
        const ask = async (query: { queryKey: readonly unknown[]; queryFn?: unknown }) => {
          if (gone || queryClient.getQueryState(query.queryKey)) return;
          await queryClient
            .fetchQuery({ ...query, meta: { silent: true } } as Parameters<typeof queryClient.fetchQuery>[0])
            .catch(() => {});
          if (!queryClient.getQueryCache().find({ queryKey: query.queryKey, exact: true })?.getObserversCount()) {
            queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
          }
        };
        await ask(courseQuery(dep, dest, via));
        // Marked ahead, the planner's chart reads for them queued behind
        // the pilot's own (the planner's chart_model.READ_AHEAD): unmarked,
        // two took both its readers and a route just typed waited 3.85 s
        // for one (the planner's measurement, 2026-10-29).
        if (showWaypoints) {
          await ask({
            queryKey: ["checkpoints-ahead", dep, dest, via.join(",")],
            queryFn: () => api.checkpoints(dep, dest, via, undefined, true, chartCycle()),
          });
        }
        await ask(navlogQuery(plan, showWaypoints, true));
      }
    });
    return () => {
      gone = true;
      cancel(handle);
    };
  }, [planSettled, aheadRoutes, aircraft, load, showWaypoints, flightRules, planned.dep, planned.dest, planned.stops]);
}
