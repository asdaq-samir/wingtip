import { sameField } from "../../lib/procedures";

/**
 * The planner's suggested fuel stops for the flight that leaves each point
 * of the route, by the point's place: null where none leaves it. The
 * planner suggests them per flight, one landing to the next through any
 * waypoints (the totals' fuel_stops, Route.flights), so each flight's are
 * matched by both its ends, in the route's order, each suggestion used
 * once: a field departed from twice (C81 to KLAS, back to C81, on to KBUF)
 * has each flight's own stops after each, where matching the departure
 * alone put the first flight's after the first and none after the second.
 * A waypoint leaves no flight of its own. Any of the planner's per-flight
 * findings named by their ends the same (the totals' no_fuel_stop too).
 */
export function fuelStopsAt<F extends { departure: string; destination: string }>(
  points: string[],
  waypoints: Set<string>,
  suggested: readonly F[],
): (F | null)[] {
  const used = new Set<F>();
  const last = points.length - 1;
  return points.map((point, i) => {
    if (i === last || waypoints.has(point)) return null;
    // The flight's end: the next landing, or the route's last point.
    const end = points.find((p, j) => j > i && (j === last || !waypoints.has(p)))!;
    const flight = suggested.find((f) => !used.has(f) && sameField(f.departure, point) && sameField(f.destination, end));
    if (!flight) return null;
    used.add(flight);
    return flight;
  });
}
