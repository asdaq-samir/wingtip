import { sameField } from "../../lib/procedures";

/** The place among the typed points of a point's `n`th visit (0 the
 *  first), or -1: a fix along an airway is no typed point. The departure,
 *  a field's own step, is never one of these rows. A fix flown twice (out
 *  and back over VPBNG) is two typed points, and each visit's menu works
 *  on its own (the audit's WEB-2). */
export function nthTyped(routePoints: readonly string[], ident: string, n: number): number {
  let left = n;
  for (let j = 1; j < routePoints.length; j++) {
    if (!sameField(routePoints[j]!, ident)) continue;
    if (left === 0) return j;
    left--;
  }
  return -1;
}

/** A typed point's visit, by its place among the route's points: how many
 *  times the route is at it before (`seen`; the departure, a field's own
 *  step, not counted, as nthTyped does not), and, where the route is at it
 *  more than once, which visit this is, from 1 (`visit`), for its own
 *  altitude's key (visitKey) -- as ProceduresRoute counts the nav log's
 *  rows (the audit's WEB-2). */
export function visitAt(routePoints: readonly string[], index: number): { seen: number; visit: number | undefined } {
  const ident = routePoints[index];
  if (ident === undefined || index === 0) return { seen: 0, visit: undefined };
  const at = (p: string) => sameField(p, ident);
  const seen = routePoints.slice(1, index).filter(at).length;
  const again = routePoints.slice(1).filter(at).length > 1;
  return { seen, visit: again ? seen + 1 : undefined };
}

/** A typed point's own row of the nav log: the departure's, the
 *  destination's, or a stop's `seen`th visit's (visitAt), so a point the
 *  route is at twice reads each visit's altitude, fuel and time, not the
 *  first's at both. */
export function visitRow<R extends { kind: string; airport?: { ident: string } }>(
  rows: readonly R[],
  role: "Departure" | "Stop" | "Destination",
  ident: string,
  seen: number,
): R | undefined {
  if (role === "Departure") return rows.find((r) => r.kind === "departure");
  if (role === "Destination") return rows.find((r) => r.kind === "destination");
  return rows.filter((r) => r.kind === "stop" && !!r.airport && sameField(r.airport.ident, ident))[seen];
}
