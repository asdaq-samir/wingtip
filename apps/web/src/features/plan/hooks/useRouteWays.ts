import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AircraftChoice, RouteOptions } from "../../../lib/api/types";
import { routeOf } from "../../../lib/identSchema";
import { usePreferences } from "../../../lib/preferences";
import { queryClient, routeOptionsQuery } from "../../../lib/queryClient";
import { sameStops } from "../lib/routeWays";
import { sameRoute } from "./planMessages";
import type { PlannedRoute } from "./planAddress";

/** The route with the fuel stops it needs put in (RouteOptions.own), for
 *  its card before anything is planned. */
export interface FuelCard {
  stops: string[];
  added: string[];
  nm: number;
  air: number | null;
  ground: number;
  landings: number;
}

/** The route as it was before the first Routes card was swiped into FPL,
 *  with its figures, kept for Your Route to put it back (useRouteWays). */
export interface Browsing {
  /** The route's ends it was kept under (chosenKey). */
  key: string;
  stops: string[];
  fuel: string[];
  withFuel: FuelCard | null;
  ownMinutes: number | null;
  ownGround: number;
  ownNm: number | null;
  /** The typed route's fuel burnt, its nav log's (Totals.fuel_gal). */
  ownGal: number | null;
  /** The ways' stops, as they have been offered from it. */
  ways: string[][];
}

/**
 * FPL's Routes, asked for (usePlanWorkspace): the ways round storms,
 * weather under the minimums the settings name, prohibited areas, TFRs
 * and high ground (lib/routeOptions in the planner), for a VFR route with
 * both ends; one picked is the route, its fuel stops named as such, and
 * the pilot's to change. Before the plan, as nothing is planned till one
 * of them is picked; the chips made from them are useRouteLine's.
 */
export function useRouteWays({
  planned,
  aircraft,
  depart,
  local,
  flightRules,
}: {
  planned: PlannedRoute;
  aircraft: AircraftChoice;
  depart: string;
  /** A local flight, an airport to itself with no stop. */
  local: boolean;
  flightRules: string;
}) {
  const minimums = usePreferences((p) => p.minimums);
  const routeWeather = usePreferences((p) => p.routeWeather);
  const ceilingFt = routeWeather === "personal" ? minimums.ceilingFt : null;
  const visibilitySm = routeWeather === "personal" ? minimums.visibilitySm : null;
  // Swiping the Routes' cards puts each in FPL as it comes into sight --
  // the route box and the course line, nothing planned -- at the
  // owner's "Can fpl also reflect the change of the card?", as Maps'
  // directions follow the route picked; the route as it was before the
  // first card is kept here (with its figures and its fuel stops' card),
  // the cards asked for and drawn from it, and Your Route puts it back.
  // Use keeps the one in sight; a change of the route by hand ends it.
  const [browsingKept, setBrowsing] = useState<Browsing | null>(null);
  const chosenKey = `${planned.dep}|${planned.dest ?? ""}`;
  // Kept only under the same ends, while the route is one of the cards':
  // a route changed by hand is the route, the cards asked for afresh from
  // it. With the ends swapped the stops are the same (none) and the kept
  // figures and fuel stops were the old route's (the audit of 2026-10-24).
  // The ways as they are now too, off the query's cache: asked for again
  // (the minimums or the time changed) while browsing, a way not among
  // those kept ended the browsing, and the way in sight became the route.
  const keptWays = browsingKept
    ? (queryClient
        .getQueryData<RouteOptions>(
          routeOptionsQuery(planned.dep, `${planned.dest ?? ""}`, browsingKept.stops.join(","), { ...aircraft }, depart || undefined, {
            ceilingFt,
            visibilitySm,
          }).queryKey,
        )
        ?.options.map((o) => o.stops) ?? [])
    : [];
  const browsing =
    browsingKept &&
    browsingKept.key === chosenKey &&
    (sameStops(planned.stops, browsingKept.stops) ||
      (browsingKept.withFuel && sameStops(planned.stops, browsingKept.withFuel.stops)) ||
      [...browsingKept.ways, ...keptWays].some((w) => sameStops(w, planned.stops)))
      ? browsingKept
      : null;
  const baseStops = browsing?.stops ?? planned.stops;
  const vfrRoute = routeOf(planned.dep, planned.dest, planned.stops) !== null && !local && flightRules === "vfr";
  // Asked for as soon as the route is known: nothing is planned till one
  // of them is picked (below), so they no longer wait on the nav log.
  // The airplane handed on as a copy: handed to a plain function itself,
  // the compiler takes it as changed there and skips every later memo
  // that reads it (lib/queryClient's queries are pure).
  const routeWaysQuery = useQuery({
    ...routeOptionsQuery(planned.dep, `${planned.dest ?? ""}`, baseStops.join(","), { ...aircraft }, depart || undefined, {
      ceilingFt,
      visibilitySm,
    }),
    enabled: vfrRoute,
    // The ways before kept on the row while the same route is asked for
    // again -- another airplane, departure time or minimums -- so FPL's
    // Routes row stays where it is, dimmed, till the new ones come: it
    // went for half a second at every change of airplane, and the list
    // under it jumped up and back (the flicker audit's FL-12). Not under a
    // new route, whose ways are other ways (keyed [_, dep, dest, via]).
    placeholderData: (previous, previousQuery) =>
      previousQuery && sameRoute(previousQuery.queryKey, [planned.dep, `${planned.dest ?? ""}`, baseStops.join(",")])
        ? previous
        : undefined,
  });
  const routeWays = routeWaysQuery.data;
  // The ways shown are the last airplane's or time's while the new ones
  // come: drawn dimmed and not to be picked (useRouteLine), as their
  // fuel and fuel stops are another airplane's.
  const waysStale = routeWaysQuery.isPlaceholderData;
  // The route with the fuel stops it needs put in, the planner's grid's
  // (RouteOptions.own), for its card before anything is planned.
  const own = routeWays?.own;
  const ownWithFuel = useMemo(
    (): FuelCard | null =>
      own && own.landings > 0
        ? { stops: own.stops, added: own.fuel, nm: own.distance_nm, air: own.air_min, ground: own.ground_min, landings: own.landings }
        : null,
    [own],
  );
  return { browsing, setBrowsing, chosenKey, vfrRoute, routeWays, waysStale, ownWithFuel };
}
