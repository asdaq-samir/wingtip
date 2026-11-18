import type { PlanSlices } from "../vm/planSlices";

/**
 * Whether FPL's route's field is open (RouteEditor) over its timeline
 * (decision 0046): on the ground, with no whole route yet -- a new plan,
 * half a route -- or a route being typed in, till its Done. The timeline
 * itself is where the route is edited, whatever this says. In flight and
 * in a dry run it is read, never edited.
 */
export function routeEditing(vm: PlanSlices<"flight" | "routeList">): boolean {
  if (vm.flight.flying || vm.flight.dryRunning) return false;
  return !vm.routeList.routeFolded;
}

/** Whether FPL offers its suggested routes (RoutesToggle): there are ways
 *  to suggest, on the ground, and the route's field not open -- the ways
 *  change the route rather than edit it, so the toggle went on doing
 *  nothing while the field was open. */
export function routesOffered(vm: PlanSlices<"flight" | "routeList">): boolean {
  return !!vm.routeList.routeLine && !vm.flight.flying && !routeEditing(vm);
}

/** Whether the suggested routes are out: their pills over the route
 *  (FplRoute) and their ways on the map (PlanMap), one switch for both. */
export function routesOut(vm: PlanSlices<"flight" | "routeList">): boolean {
  return vm.routeList.routesShown && routesOffered(vm);
}
