import type { PlanSlices } from "../vm/planSlices";

/**
 * Whether FPL's route is open to edit now, the one layout's expanded face
 * (decision 0046): on the ground, not folded -- a tap on its line opened
 * it, it is not yet whole, or a stop is being typed in (a point the
 * planner does not know is said on its folded line, in red). In
 * flight and in a dry run it is read, never edited.
 */
export function routeEditing(vm: PlanSlices<"flight" | "routeList">): boolean {
  if (vm.flight.flying || vm.flight.dryRunning) return false;
  return !vm.routeList.routeFolded;
}
