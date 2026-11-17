import { useQueries } from "@tanstack/react-query";
import { unknownWhy } from "../../../lib/api/client";
import { leaveWhen } from "../../../lib/format/leaveWhen";
import { identOf, isPosition } from "../../../lib/identSchema";
import { sameField } from "../../../lib/procedures";
import { airportQuery } from "../../../lib/queryClient";
import { DepartPicker } from "../../navlog/lazy";
import { TimelineRoute, type TimelinePoint } from "../../procedures/lazy";
import { etaAt } from "../../plan";
import type { PlanSlices } from "../vm/planSlices";
import type { ProceduresRouteProps } from "../../procedures/lazy";

/**
 * FPL's route on the ground, the one layout (decision 0046) and where it
 * is edited (the owner's two-row timeline, 2026-11-17): the plan's points
 * in order for the procedures' timeline (TimelineRoute) -- the departure,
 * every stop (an airport, a waypoint or an airway typed), the destination
 * -- each with its time (the departure's leave time to pick, as its
 * picker says it; the others' arrival clock time from the nav log, a dash
 * with no airplane), its flight category from its latest METAR, whether
 * it is a fuel stop, and what keeps it from being flown to: a point the
 * planner does not know, or a field NASR lists as closed (its card's
 * label, the engine's field_status; decision 0043), with "Pick another
 * field." No city on a line (the owner, 2026-11-17: "We don't need to say
 * the city name"); a Direct To's start is My Location.
 */
export default function RouteTimeline({
  vm,
  props,
}: {
  vm: PlanSlices<"brief" | "flight" | "leg" | "plan" | "route" | "routeList">;
  /** The route's fields and points as the procedures draw them (useRouteListProps). */
  props: ProceduresRouteProps;
}) {
  const { depart, fuelParam, planned, routePoints } = vm.route;
  const { aircraft, changeDepart, s } = vm.plan;
  const { routeRows } = vm.leg;
  const { metarCategory } = vm.brief;
  const { waypointStops } = vm.routeList;
  const read = !!vm.flight.flying || !!vm.flight.dryRunning;
  const fuel = (fuelParam ?? "").split(",").filter(Boolean);
  // Each field's card, asked once and shared with the route's colours
  // (useFieldColours) and its cards: whether NASR lists it closed.
  const fields = routePoints.filter((p) => !isPosition(p) && !!identOf(p) && !waypointStops.has(p));
  const cards = useQueries({ queries: fields.map((ident) => ({ ...airportQuery(ident), staleTime: 10 * 60_000 })) });
  const closedOf = (ident: string) => cards[fields.indexOf(ident)]?.data?.closed ?? null;
  const timeOf = (ident: string, role: TimelinePoint["role"]) => {
    if (role === "Departure")
      return read ? depart ? leaveWhen(new Date(depart)) : "Now" : <DepartPicker value={depart} onChange={changeDepart} look="time" />;
    if (aircraft.none) return "—";
    const row = routeRows.find(
      (r) =>
        (r.kind === "stop" || r.kind === "destination") &&
        (role === "Destination" ? r.kind === "destination" : "airport" in r && sameField(r.airport.ident, ident)),
    );
    return row ? etaAt(depart || new Date().toISOString(), row.minutesFlown) : "—";
  };
  const points: TimelinePoint[] = routePoints.map((ident, index) => {
    const role =
      index === 0 && ident === planned.dep
        ? "Departure"
        : index === routePoints.length - 1 && ident === planned.dest
          ? "Destination"
          : "Stop";
    const field = fields.includes(ident);
    const unknown = s.unknownPlace?.ident && sameField(s.unknownPlace.ident, ident) ? unknownWhy(s.unknownPlace) : null;
    const closed = field ? closedOf(ident) : null;
    return {
      ident,
      role,
      index,
      time: timeOf(ident, role),
      category: unknown || !field ? null : metarCategory(ident),
      problem: unknown ?? (closed ? `${closed}. Pick another field.` : null),
      fuelStop: role === "Stop" && fuel.some((f) => sameField(f, ident)),
      field,
    };
  });
  return <TimelineRoute {...props} points={points} />;
}
