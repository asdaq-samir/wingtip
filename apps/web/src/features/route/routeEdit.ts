import { MAX_STOPS, isPosition } from "../../lib/identSchema";
import { callEngine } from "../../lib/engine/engine";
import { sameField, type TypedProcedure } from "../../lib/procedures";

/** The route as the box changes it: either end may be missing (half a
 *  route, the other end still to be typed), and neither means none. */
export interface RouteParts {
  dep: string;
  stops: string[];
  dest: string;
}

/** The route as the box sees it: its points in the order flown, which
 *  ends it has, and which points can be an end (an airport, or a present
 *  position: a waypoint is flown through, never taken off from or landed
 *  at). */
export interface RouteShape {
  points: string[];
  hasDep: boolean;
  hasDest: boolean;
  isEnd: (ident: string) => boolean;
  /** The destination as the pilot typed it, where the plan has named it
   *  anew by its field's ICAO ident since (useRouteTidy: "OSH" typed is
   *  KOSH); the point the route goes on past is this (withTyped). */
  typedDest?: string | null;
}

/** The points of a route, in the order flown. */
export function pointsOf(route: RouteParts): string[] {
  return [...(route.dep ? [route.dep] : []), ...route.stops, ...(route.dest ? [route.dest] : [])];
}

/**
 * Where a point may go, the one rule every change of the route's points
 * asks (a move, a Change, an Add a Stop, a removal, the box's list): My
 * Location (a present position) at an end alone, where the route starts
 * from or comes back to where the airplane is, never a stop on the way
 * (the owner, 2026-11-17); and no point straight after itself, a leg of
 * none (KDLH, KDLH, KMDW) -- but, where `roundTrip`, a route of one
 * airport twice, a local flight, which the box lets through to be said
 * and changed there.
 */
export function placeAllowed(route: RouteParts, roundTrip = false): boolean {
  if (placeRefusal(route)) return false;
  const list = pointsOf(route);
  return !list.some((p, i) => i > 0 && p === list[i - 1]) || (roundTrip && list.length === 2);
}

/** What FPL's list says under My Location where a move to a stop's
 *  place is refused (the owner, 2026-11-18): in place, as lib/problems
 *  has an error said where it happens, never a toast. */
export const POSITION_AT_END = "My Location can only start or end the route.";

/** Why the route's points may not go where they are, where a pilot is
 *  told: My Location as a stop (POSITION_AT_END). Null where placeAllowed
 *  has nothing to say -- a point beside the same, refused unsaid, as the
 *  list offers no place for it. */
export function placeRefusal(route: RouteParts): string | null {
  return route.stops.some(isPosition) ? POSITION_AT_END : null;
}

/** The route with one visit of a stop taken out: the one at `at` among
 *  the route's points where that is the stop, else its first, never every
 *  visit of it; null where it is not a stop, or where taking it out puts
 *  a point straight after itself (placeAllowed). */
export function withoutStop(route: RouteParts, ident: string, at?: number): RouteParts | null {
  const offset = route.dep ? 1 : 0;
  const placed = at === undefined ? -1 : at - offset;
  const i = placed >= 0 && sameField(route.stops[placed] ?? "", ident) ? placed : route.stops.findIndex((s) => sameField(s, ident));
  if (i < 0) return null;
  const next = { ...route, stops: route.stops.filter((_, j) => j !== i) };
  return placeAllowed(next, true) ? next : null;
}

/**
 * A list of points back into the route's parts, the ends kept where they
 * were. No end a waypoint, no more stops than the planner takes, and each
 * point where it may go (placeAllowed) -- a route of one airport twice let
 * through, to be said (PlanWorkspace's notice) and changed in the box.
 * Null where the list breaks one of those.
 */
export function routeOf(list: string[], withDep: boolean, withDest: boolean, isEnd: (ident: string) => boolean): RouteParts | null {
  const d = withDep && list.length ? list[0]! : "";
  const a = withDest && list.length > (d ? 1 : 0) ? list.at(-1)! : "";
  const route = { dep: d, stops: list.slice(d ? 1 : 0, a ? list.length - 1 : list.length), dest: a };
  if ((d && !isEnd(d)) || (a && !isEnd(a)) || route.stops.length > MAX_STOPS || !placeAllowed(route, true)) return null;
  return route;
}

/** The role of the point at `i`: the departure, the destination or a stop. */
export function roleAt({ points, hasDep, hasDest }: RouteShape, i: number): "dep" | "stop" | "dest" {
  return i === 0 && hasDep ? "dep" : i === points.length - 1 && hasDest ? "dest" : "stop";
}

/** The point at `i` taken out: the next airport along becomes the end
 *  taken out; of two, the other end stays, half a route; the last, no
 *  route. */
export function withoutPoint(shape: RouteShape, i: number): RouteParts | null {
  const { points, hasDep, hasDest, isEnd } = shape;
  const list = points.filter((_, j) => j !== i);
  const role = roleAt(shape, i);
  if (list.length === 1 && role !== "stop") return routeOf(list, role === "dest", role === "dep", isEnd);
  return routeOf(list, hasDep && (role !== "dep" || isEnd(list[0] ?? "")), hasDest && (role !== "dest" || isEnd(list.at(-1) ?? "")), isEnd);
}

/**
 * What was typed, put in where it was typed: before point `at`, as stops
 * (the departure, with none, when it is an airport); after the last
 * (`at` null), the route goes on to it -- the last airport typed the
 * destination, the old destination and anything typed before it stops on
 * the way (a waypoint typed there is a stop before the destination: a
 * flight does not end at one). Into an empty box -- the route cleared --
 * the first airport typed is the departure, the last the destination.
 * The route, or null where it would break routeOf's rules, and where the
 * caret goes next: after what was put in, or (null) after the last point.
 *
 * Where the route `goesOn` -- the words typed end in a SID or STAR, whose
 * field is still to be typed -- the last point typed is no destination:
 * "OSH OSHH2" says OSH is the STAR's transition fix, flown through, and
 * the destination comes after it (readTyped). The route stays without one
 * till it is typed. And the destination the route goes on past is the
 * point as typed (`typedDest`), not the field the plan named it by as an
 * end: three letters that are both a navaid and a field's FAA ident are
 * the navaid where the route flies on through them, as a flight plan
 * reads them (the planner's resolve_stop: "RFD" is the Rockford DME, the
 * airport KRFD; FAA JO 7350.9's three-letter location identifiers are
 * shared by a navaid and its field, OSH the Oshkosh VORTAC and Wittman
 * Regional's FAA ident). Made a stop at KOSH, it was landed at.
 */
export function withTyped(
  shape: RouteShape,
  fresh: string[],
  at: number | null,
  goesOn = false,
): { route: RouteParts | null; next: number | null } {
  const { points, hasDep, hasDest, isEnd } = shape;
  if (!points.length)
    return { route: routeOf(fresh, isEnd(fresh[0]!), !goesOn && fresh.length > 1 && isEnd(fresh.at(-1)!), isEnd), next: null };
  if (at !== null && at < points.length) {
    const departure = at === 0 && !hasDep && isEnd(fresh[0]!);
    const list = [...points.slice(0, at), ...fresh, ...points.slice(at)];
    return { route: routeOf(list, hasDep || departure, hasDest, isEnd), next: at + fresh.length };
  }
  const dest = points.at(-1)!;
  if (!goesOn && !isEnd(fresh.at(-1)!)) {
    const list = [...points.slice(0, hasDest ? -1 : undefined), ...fresh, ...(hasDest ? [dest] : [])];
    return { route: routeOf(list, hasDep, hasDest, isEnd), next: null };
  }
  const passed = hasDest ? [...points.slice(0, -1), shape.typedDest || dest] : points;
  return { route: routeOf([...passed, ...fresh], hasDep, !goesOn, isEnd), next: null };
}

/**
 * Words typed, read by the engine (`route_typed`, as the phones' Type Route
 * reads them): a route typed whole as a pilot files it (AIM Appendix 4: DCT
 * out, item 15's speed and level group the cruise, "LEXOR/N0467F380" the
 * point; decision 0045), the SIDs and STARs typed among the words ("KMSP
 * BAEE1 BAE ... OSH OSHH2 KATW"), which are the route's procedures, not
 * points -- each with the points typed either side of it, to be picked
 * once the route is in -- and the points, each as a stop's ident.
 * Procedures are read only where the box has somewhere to send them.
 * `words` are the words read, for what is held to come after them
 * (releaseTyped); `cruiseFt` the cruise a group typed asks for; `goesOn`
 * where they end in a procedure, its field still to come (withTyped).
 */
export function readTyped(
  typed: string[],
  withProcedures: boolean,
): { fresh: string[]; procedures: TypedProcedure[]; words: string[]; cruiseFt: number | null; goesOn: boolean } {
  const read = callEngine("route_typed", { words: typed, procedures: withProcedures });
  return { fresh: read.points, procedures: read.procedures, words: read.words, cruiseFt: read.cruise_ft, goesOn: read.goes_on };
}

/**
 * The typed SIDs and STARs to pick now, and those held. One among the words
 * that ended last, with nothing typed after it yet, waits for what comes
 * after it: a filed route's STAR comes before its destination, and the box
 * puts words in as each one ends, so "... OSH OSHH2 KATW" asked OSH, the
 * destination then, for OSHH2, and KATW's arrival was never picked
 * (ifr.spec, 2026-11-13). Given out with the next words, its `after` the
 * first point among them, or as the typing is `done` (a commit). Those
 * held kept in `held`.
 */
export function releaseTyped(
  held: { current: TypedProcedure[] },
  words: string[],
  procedures: TypedProcedure[],
  done: boolean,
): TypedProcedure[] {
  const next = words.map((w) => w.trim().toUpperCase()).find((w) => w && !procedures.some((p) => p.name === w)) ?? null;
  const all = [...held.current.map((p) => (p.after === null && next ? { ...p, after: next } : p)), ...procedures];
  const waits = (p: TypedProcedure) => !done && p.after === null;
  held.current = all.filter(waits);
  return all.filter((p) => !waits(p));
}
