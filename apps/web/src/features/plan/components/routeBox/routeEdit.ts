import { MAX_STOPS, stopOf } from "../../../../lib/identSchema";
import { TYPED_PROCEDURE, type TypedProcedure } from "../../../../lib/procedures";

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
}

/** The points of a route, in the order flown. */
export function pointsOf(route: RouteParts): string[] {
  return [...(route.dep ? [route.dep] : []), ...route.stops, ...(route.dest ? [route.dest] : [])];
}

/**
 * A list of points back into the route's parts, the ends kept where they
 * were. No end a waypoint, no more stops than the planner takes, and no
 * point straight after itself (KDLH, KDLH, KMDW) -- but a route of one
 * airport twice is let through, to be said (PlanWorkspace's notice) and
 * changed in the box. Null where the list breaks one of those.
 */
export function routeOf(list: string[], withDep: boolean, withDest: boolean, isEnd: (ident: string) => boolean): RouteParts | null {
  const d = withDep && list.length ? list[0]! : "";
  const a = withDest && list.length > (d ? 1 : 0) ? list.at(-1)! : "";
  const route = { dep: d, stops: list.slice(d ? 1 : 0, a ? list.length - 1 : list.length), dest: a };
  const repeats = list.some((p, i) => i > 0 && p === list[i - 1]) && list.length !== 2;
  if ((d && !isEnd(d)) || (a && !isEnd(a)) || route.stops.length > MAX_STOPS || repeats) return null;
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
  return routeOf(
    list,
    hasDep && (role !== "dep" || isEnd(list[0] ?? "")),
    hasDest && (role !== "dest" || isEnd(list.at(-1) ?? "")),
    isEnd,
  );
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
 */
export function withTyped(shape: RouteShape, fresh: string[], at: number | null): { route: RouteParts | null; next: number | null } {
  const { points, hasDep, hasDest, isEnd } = shape;
  if (!points.length) return { route: routeOf(fresh, isEnd(fresh[0]!), fresh.length > 1 && isEnd(fresh.at(-1)!), isEnd), next: null };
  if (at !== null && at < points.length) {
    const departure = at === 0 && !hasDep && isEnd(fresh[0]!);
    const list = [...points.slice(0, at), ...fresh, ...points.slice(at)];
    return { route: routeOf(list, hasDep || departure, hasDest, isEnd), next: at + fresh.length };
  }
  const dest = points.at(-1)!;
  if (!isEnd(fresh.at(-1)!)) {
    const list = [...points.slice(0, hasDest ? -1 : undefined), ...fresh, ...(hasDest ? [dest] : [])];
    return { route: routeOf(list, hasDep, hasDest, isEnd), next: null };
  }
  return { route: routeOf([...points, ...fresh], hasDep, true, isEnd), next: null };
}

/**
 * Words typed, read: the points among them, each as a stop's ident, and
 * the SIDs and STARs typed among them ("KMSP BAEE1 BAE ... OSH OSHH2
 * KATW", lib/procedures' TYPED_PROCEDURE), which are the route's
 * procedures, not points -- each with the points typed either side of it,
 * to be picked once the route is in. Procedures are read only where the
 * box has somewhere to send them.
 */
export function readTyped(typed: string[], withProcedures: boolean): { fresh: string[]; procedures: TypedProcedure[] } {
  const words = typed.map((t) => t.trim().toUpperCase()).filter(Boolean);
  const isProcedure = (word: string) => withProcedures && TYPED_PROCEDURE.test(word);
  const procedures = words.flatMap((word, i) =>
    isProcedure(word)
      ? [
          {
            name: word,
            before:
              words
                .slice(0, i)
                .reverse()
                .find((w) => !isProcedure(w)) ?? null,
            after: words.slice(i + 1).find((w) => !isProcedure(w)) ?? null,
          },
        ]
      : [],
  );
  const fresh = words
    .filter((w) => !isProcedure(w))
    .map(stopOf)
    .filter(Boolean);
  return { fresh, procedures };
}
