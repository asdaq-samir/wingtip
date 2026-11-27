import { procedureTitle, sameField } from "../../lib/procedures";
import type { ProcedureAirport } from "../plan";
import type { ProceduresRouteModel, RouteListSlice } from "./useProceduresRoute";

// What FPL's timeline reads of a field's procedure as it draws it
// (TimelineProcedureRows, TimelineApproachParts).

/** The procedure's name as its head says it: an approach's without its
 *  runway, then its own runway, "ILS · RWY 09"; a circling-only one's
 *  alone, "RNAV (GPS)-B", no runway picked to circle to beside it (the
 *  owner, 2026-11-24: "Don't show runway next to approach for a circling
 *  approach"); an arrival's and a departure's with their transition, as
 *  the route says them. */
export function headName(placed: ProceduresRouteModel["inRoute"][number]) {
  if (!placed.name) return placed.label;
  if (placed.kind !== "approach") return procedureTitle(placed.name);
  const own = /\bRWY\s*(\S+)$/i.exec(placed.name)?.[1] ?? null;
  const short = procedureTitle(placed.name.replace(/\s*RWY\s*\S+$/i, ""));
  // "RNAV (GPS) RWY 05", as the chart titles it.
  return own ? `${short} RWY ${own}` : short;
}

/** What goes small under a procedure's name: the fix ATC sent the
 *  airplane direct to, else its transition (the owner, 2026-11-24). */
export function headSub(placed: ProceduresRouteModel["inRoute"][number]): string | null {
  // An approach with no transition is flown from vectors to final, said
  // "Vectors" on its pill (the owner, 2026-11-25); its menu's choice keeps
  // the whole words (transitionWords).
  return placed.direct ? `Direct ${placed.direct}` : (placed.transition ?? (placed.kind === "approach" ? "Vectors" : null));
}

/** The approach picked at a field, as the route list has it. */
export const approachAt = (vm: RouteListSlice<"inRoute">, field: ProcedureAirport) =>
  vm.inRoute.find((p) => sameField(p.ident, field.ident) && p.kind === "approach");

/** Whether the field's approach is activated with its missed approach
 *  unsuspended, coded to fly: the line goes on past the field's own. */
export const missedOnTheLine = (vm: RouteListSlice<"inRoute">, field: ProcedureAirport) => {
  const placed = approachAt(vm, field);
  return !!placed && !placed.loaded && !!placed.missed && (placed.missedFixes?.length ?? 0) > 0;
};
