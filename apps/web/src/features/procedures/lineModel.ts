import type { ReactNode } from "react";
import { sameField } from "../../lib/procedures";
import type { NavLogRow, ProcedureAirport, ProcedureKind } from "../plan";
import { missedOnTheLine } from "./approachState";
import { fieldParts, kindPicked, type FieldPart } from "./fieldParts";
import type { ProceduresRouteModel } from "./useProceduresRoute";

/** One point of FPL's timeline as the plan gives it (RouteTimeline). */
export interface TimelinePoint {
  ident: string;
  role: ProcedureAirport["role"];
  /** Its place among the route's typed points (routePoints). */
  index: number;
  /** How many times the route is at it before, and which visit this is
   *  where it is at it more than once (visitAt): its nav log row's and
   *  its own altitude's. */
  seen: number;
  visit: number | undefined;
  /** Its time: the departure's leave time, the others' arrival. */
  time: ReactNode;
  /** Its flight category from its latest METAR; none with no report. */
  category: string | null;
  /** Why it cannot be flown to, in red under it: a point the planner does
   *  not know, a field NASR lists as closed (decision 0043), or a field
   *  whose card could not be had to say. */
  problem: string | null;
  /** A field whose card has not said yet whether it is open: its line
   *  does not open to its runways and procedures till it has (0043). */
  checking: boolean;
  /** A fuel stop the plan or the pilot picked. */
  fuelStop: boolean;
  /** An airport, not My Location or a waypoint. */
  field: boolean;
}

/** A part of a field's line (fieldParts) with what its tray offers after
 *  its chips: each kind not yet picked ("+ APCH"), and the destination's
 *  hold once it has one (HoldChip; no "+ HOLD", the owner, 2026-11-19). */
interface LinePart {
  part: FieldPart;
  add: ProcedureKind[];
  hold: boolean;
}

/**
 * What one line of FPL's timeline shows (TimelineLine draws it), worked
 * out from the plan's view model alone, with no React: whether it opens,
 * a move of it refused, its fuel and whether that is set there, its
 * field's parts, and the procedures' fixes on the route's line before and
 * after it.
 */
export function lineModel(
  vm: ProceduresRouteModel,
  point: TimelinePoint,
  row: NavLogRow | undefined,
  field: ProcedureAirport | undefined,
  last: boolean,
) {
  // Never opened to land at before the field is known open (decision 0043).
  const opens = !!field && !!vm.edit && !point.problem && !point.checking;
  // A move of this point refused, why under it (useRouteListEdit).
  const refused = vm.edit?.refusal?.index === point.index ? vm.edit.refusal.note : null;
  const tank = point.role === "Departure" ? vm.tanks.get("departure") : row ? vm.tanks.get(row.key) : undefined;
  // The gauge is a control where the fuel leaving the field is set there
  // (FuelSet): the departure's and a stop's, where the list edits the
  // route; the field it is set at, null where it is read only.
  const fuelSet =
    tank && vm.onTanks && row && point.field && !point.problem && (row.kind === "departure" || row.kind === "stop")
      ? { ident: row.airport.ident, stop: row.kind === "stop" }
      : null;
  const split = field ? fieldParts(vm, field, row) : [];
  const parts: LinePart[] = split.map((part) => ({
    part,
    add: field ? part.kinds.filter((k) => !kindPicked(vm, field, k)) : [],
    hold: point.role === "Destination" && part.role === "Arrive" && !!vm.holdOn(point.ident),
  }));
  // A kind picked is no chip: its fixes are points on the route's line
  // (TimelineProcedureRows), at the owner's pick (option D, 2026-11-21):
  // an arrival's and an approach's before the field's line, a departure's
  // after it. An approach only loaded is no point on the line: its box
  // sits after the field's line, off it (LoadedApproach).
  const loadedHere = !!field && vm.inRoute.some((p) => p.kind === "approach" && !!p.loaded && sameField(p.ident, field.ident));
  const onLine = (role: FieldPart["role"]) =>
    field && !point.problem
      ? (split.find((p) => p.role === role)?.kinds ?? []).filter((k) => kindPicked(vm, field, k) && !(k === "approach" && loadedHere))
      : [];
  const before = onLine("Arrive");
  const after = onLine("Depart");
  // Its missed approach unsuspended, the line goes on into it.
  const missedOn = !!field && !point.problem && missedOnTheLine(vm, field);
  const onPast = !last || after.length > 0;
  return { opens, refused, tank, fuelSet, reported: vm.reportedOf(point.ident), parts, before, after, missedOn, onPast };
}
