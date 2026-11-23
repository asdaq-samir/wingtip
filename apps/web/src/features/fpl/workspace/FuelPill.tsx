import { sameField } from "../../../lib/procedures";
import { FuelStopsChip, NoFuelStopNote } from "../../procedures/lazy";
import type { PlanSlices } from "../vm/planSlices";

/**
 * The fuel stops' pill at the box's bottom right, before its toggle, on
 * both of its faces: Add a Stop's end on the timeline (RouteTimeline) and
 * the route's field (RouteEditor), so the two sit in one place and the
 * toggle never moves them (the owner, 2026-11-23: "No pill for fuel stops
 * in route box?"). The planner's suggested ones put in, every flight's,
 * or, once the route has fuel stops and needs no more, taken out again
 * (the owner, 2026-11-20); none where there are neither. Add while any
 * flight still has stops suggested, though some are in: the owner's trip
 * read 21 gal short after the tap, its last flight's stops never offered.
 */
export function FuelPill({ vm }: { vm: PlanSlices<"route" | "stops"> }) {
  const { fuelParam, planned, setStops } = vm.route;
  const { fuelToAdd, noFuelStop } = vm.stops;
  const fuel = (fuelParam ?? "").split(",").filter(Boolean);
  const fuelIn = planned.stops.some((stop) => fuel.some((f) => sameField(f, stop)));
  if (fuelToAdd) return <FuelStopsChip added={false} onClick={fuelToAdd.add} />;
  if (fuelIn)
    return <FuelStopsChip added onClick={() => setStops(planned.stops.filter((stop) => !fuel.some((f) => sameField(f, stop))))} />;
  return noFuelStop[0] ? <NoFuelStopNote flight={noFuelStop[0]} /> : null;
}
