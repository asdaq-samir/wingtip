import { sameField } from "../../lib/procedures";
import type { ProcedureAirport } from "../plan";
import type { ProceduresRouteModel } from "./useProceduresRoute";

// What FPL's timeline reads of a field's procedure as it draws it
// (TimelineProcedureRows, TimelineApproachParts).

/** The procedure's name as its head says it: an approach's without its
 *  runway, then the runway it lands on -- its own, or the one picked to
 *  circle to -- "RNAV (GPS)-B · RWY 24"; an arrival's and a departure's
 *  with their transition, as the route says them. */
export function headName(vm: ProceduresRouteModel, field: ProcedureAirport, placed: ProceduresRouteModel["inRoute"][number]) {
  if (placed.kind !== "approach" || !placed.name) return placed.label;
  const own = /\bRWY\s*(\S+)$/i.exec(placed.name)?.[1] ?? null;
  const runway = own ?? vm.chosenAt(field.ident);
  const short = placed.name.replace(/\s*RWY\s*\S+$/i, "");
  return runway ? `${short} · RWY ${runway}` : short;
}

/** The approach picked at a field, as the route list has it. */
export const approachAt = (vm: ProceduresRouteModel, field: ProcedureAirport) =>
  vm.inRoute.find((p) => sameField(p.ident, field.ident) && p.kind === "approach");

/** Whether the field's approach is activated with its missed approach
 *  unsuspended, coded to fly: the line goes on past the field's own. */
export const missedOnTheLine = (vm: ProceduresRouteModel, field: ProcedureAirport) => {
  const placed = approachAt(vm, field);
  return !!placed && !placed.loaded && !!placed.missed && (placed.missedFixes?.length ?? 0) > 0;
};
