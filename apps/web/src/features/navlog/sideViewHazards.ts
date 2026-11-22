import { useQuery } from "@tanstack/react-query";
import { callEngine } from "../../lib/engine/engine";
import { useBriefPlan } from "../../lib/briefPlan";
import type { RouteProfile, RouteWeather } from "../../lib/api/types";
import { routeWeatherQuery } from "../../lib/queryClient";
import type { RouteEnds } from "../plan";

/** The weather along the route for the flight the Brief is planned for
 *  (its departure and time en route, lib/briefPlan), the side view's own
 *  hops (api.routeWeather); undefined till it comes or where it fails. */
export function useRouteWeather(ends: RouteEnds): RouteWeather | undefined {
  const depart = useBriefPlan((s) => s.depart);
  const eteMin = useBriefPlan((s) => s.eteMin ?? 0);
  const stops = (ends.stops ?? []).map((s) => s.ident);
  return useQuery(routeWeatherQuery(ends.departure.ident, ends.destination.ident, stops, depart || undefined, eteMin)).data;
}

/** The DOF's obstacles along the route against the altitude shown, as its
 *  ground is coloured, and the tallest few named (the engine's
 *  profile_obstacles). */
export function profileObstacles(profile: RouteProfile, altitudeFt: number | null) {
  return callEngine("profile_obstacles", { altitude_ft: altitudeFt, length_nm: profile.length_nm, obstacles: profile.obstacles ?? [] });
}
