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

/** Whether the box's toggle has turned a whole route's grouped box into
 *  the route's field (TypeRouteButton): drawn then in the timeline's own
 *  place (RouteHead), not under the page, so the box stays where it was
 *  (the owner, 2026-11-22: "Route box moves down when toggled"). */
export function routeTyped(vm: PlanSlices<"flight" | "route" | "routeList">): boolean {
  return routeEditing(vm) && vm.route.wholeRoute && vm.routeList.routeOpen && timelineHeight > 0;
}

/** The timeline's grouped box's height as its toggle turned it into the
 *  route's field (TypeRouteButton), so the field keeps its size and shape
 *  and nothing under it jumps (the owner, 2026-11-22); none (0) once the
 *  field is folded again, and none for a field opened some other way (a
 *  route typed into the empty box, which stays where it is as it becomes
 *  whole: moved then, it was built again and lost what was still typed). */
let timelineHeight = 0;
export const keepTimelineHeight = (px: number) => {
  timelineHeight = px;
};
export const keptTimelineHeight = () => timelineHeight;

/** Whether FPL offers its suggested routes (ShareMenu's Route Options): there are ways
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
