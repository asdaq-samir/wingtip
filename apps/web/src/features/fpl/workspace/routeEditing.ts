import type { PlanSlices } from "../vm/planSlices";

/**
 * Whether FPL's route's field is open (RouteEditor) over its timeline
 * (decision 0047): on the ground, with no whole route yet -- a new plan,
 * half a route -- or a route being typed in, till its Done. The timeline
 * itself is where the route is edited, whatever this says. In flight and
 * in a dry run it is read, never edited.
 */
export function routeEditing(vm: PlanSlices<"flight" | "routeList">): boolean {
  if (vm.flight.flying || vm.flight.dryRunning) return false;
  return !vm.routeList.routeFolded;
}

/** Whether the route's field (RouteEditor) is open under the timeline:
 *  the route open to edit and the field asked for (usePlanRouteList's
 *  `boxOpen`). A new plan and half a route have it folded into their
 *  timeline's Type or Paste a Route till it is asked for. */
export function routeBoxOpen(vm: PlanSlices<"flight" | "routeList">): boolean {
  return routeEditing(vm) && vm.routeList.boxOpen;
}

/** Whether FPL offers its suggested routes (RoutesToggle): there are ways
 *  to suggest, on the ground, not in a dry run, and the route's field not
 *  open -- the ways change the route rather than edit it, so the toggle
 *  went on doing nothing while the field was open, and a dry run flies the
 *  route as it is, its ways no more than clutter on its map. */
export function routesOffered(vm: PlanSlices<"flight" | "routeList">): boolean {
  return !!vm.routeList.routeLine && !vm.flight.flying && !vm.flight.dryRunning && !routeEditing(vm);
}

/** Whether the suggested routes are out: their pills over the route
 *  (FplRoute) and their ways on the map (PlanMap), one switch for both. */
export function routesOut(vm: PlanSlices<"flight" | "routeList">): boolean {
  return vm.routeList.routesShown && routesOffered(vm);
}

type Ways = PlanSlices<"routeList">["routeList"]["wayLines"];
/** No suggested routes' ways on the map: one array, so the map is not handed a new one each render. */
const NO_WAYS: Ways = [];

/** The suggested routes' ways the map draws beside the course (PlanMap):
 *  all of them while they are out (routesOut), none otherwise -- not the
 *  route as typed's, nor a way picked, which the course itself is. */
export function waysOnMap(vm: PlanSlices<"flight" | "routeList">): Ways {
  return routesOut(vm) ? vm.routeList.wayLines : NO_WAYS;
}
