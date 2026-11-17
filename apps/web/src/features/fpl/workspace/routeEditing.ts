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
