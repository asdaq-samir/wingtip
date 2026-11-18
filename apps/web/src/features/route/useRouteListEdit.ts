import { useCallback, useMemo, useState } from "react";
import { identOf, isAirwayToken, isPosition } from "../../lib/identSchema";
import type { RouteParts } from "./RouteBox";
import type { PlanCourse } from "../plan";
import { askSearchPick } from "../../lib/oneSearch";

/** The route's points with one moved from `from` to `to`, as FPL's list
 *  drags them: the ends kept airports or a position (`isEnd`), as the box
 *  keeps them -- a waypoint is flown through, never taken off from or
 *  landed at --, My Location (a position) at an end alone, where the
 *  route starts from or comes back to where the airplane is, never a stop
 *  on the way (the owner, 2026-11-17), and no point beside the same; null
 *  where the move would break any. */
export function movedRoute(points: string[], from: number, to: number, isEnd: (point: string) => boolean): RouteParts | null {
  const next = [...points];
  const [moved] = next.splice(from, 1);
  if (moved === undefined || next.length < 1) return null;
  next.splice(to, 0, moved);
  if (!isEnd(next[0]!) || !isEnd(next.at(-1)!) || next.some((p, i) => i > 0 && p === next[i - 1])) return null;
  if (next.slice(1, -1).some(isPosition)) return null;
  return { dep: next[0]!, stops: next.slice(1, -1), dest: next.at(-1)! };
}

/** The route's points with the one at `at` made `ident` (its menu's
 *  Change, the one search's pick): null where it is empty or the same as
 *  its neighbour's, a leg of none. */
export function replacedRoute(points: string[], at: number, ident: string): RouteParts | null {
  if (at < 0 || at >= points.length) return null;
  const next = [...points];
  next[at] = ident.trim().toUpperCase();
  if (!next[at] || next.some((p, i) => i > 0 && p === next[i - 1])) return null;
  return { dep: next[0]!, stops: next.slice(1, -1), dest: next.at(-1)! };
}

/** The route's points with `ident` put in at `at` (Add a Stop): null
 *  where it would sit beside the same point, a leg of none. */
export function addedRoute(points: string[], at: number, ident: string): RouteParts | null {
  if (at < 1 || at >= points.length) return null;
  const next = [...points.slice(0, at), ident.trim().toUpperCase(), ...points.slice(at)];
  if (!next[at] || next.some((p, i) => i > 0 && p === next[i - 1])) return null;
  return { dep: next[0]!, stops: next.slice(1, -1), dest: next.at(-1)! };
}

/**
 * FPL's list of the route's points changed in place (usePlanWorkspace),
 * while the route is open to edit (the one layout's expanded list; the
 * owner, 2026-11-17, decision 0046): a point dragged to another's place,
 * made another from its menu's Change, a stop typed in at its place by
 * the route's field (RouteBox's `addAt`) -- and which stops are flown
 * through rather than landed at.
 */
export function useRouteListEdit({
  stops,
  course,
  routePoints,
  setRoute,
}: {
  /** The route's stops as typed. */
  stops: string[];
  course: PlanCourse | null;
  /** The route's points as typed, the departure first. */
  routePoints: string[];
  setRoute: (parts: RouteParts) => void;
}) {
  // The stops flown through rather than landed at: the course's own word
  // for each, and before it answers, any ident too long for an airport.
  // An airway (V100) is flown through too, fix by fix, unless the course
  // says the stop is an airport whose identifier has an airway's form.
  const waypointStops = useMemo(
    () =>
      new Set(
        stops.filter(
          (stop) =>
            course?.stops?.some((a) => a.ident === stop && a.kind === "fix") ||
            !identOf(stop) ||
            (isAirwayToken(stop) && !course?.stops?.some((a) => a.ident === stop)),
        ),
      ),
    [stops, course],
  );
  // The route's field open over the timeline (RouteEditor) till its Done;
  // and where a stop typed into it goes (RouteBox's `addAt`).
  const [routeOpen, setRouteOpen] = useState(false);
  const [addAt, setAddAt] = useState<number | null>(null);
  // A stop asked for from FPL's timeline (its Add a Stop, a point's Add a
  // Stop After, the profile's no-legal-altitude Add a Stop): by the one
  // search, as a point is changed (rules.md, the one search), put in at
  // its place.
  const typeStopAt = useCallback(
    (index: number) => {
      askSearchPick({
        label: "Add a Stop",
        fixes: true,
        onPick: (picked) => {
          const added = addedRoute(routePoints, index, picked);
          if (added) setRoute(added);
        },
      });
    },
    [routePoints, setRoute],
  );
  // A point dragged by its grip (or held) in FPL's list onto another's
  // place, as the field's pills are moved (movedRoute), and the route
  // planned again.
  const moved = useCallback(
    (from: number, to: number) => {
      const isEnd = (p: string) => (!!identOf(p) && !waypointStops.has(p)) || isPosition(p);
      return movedRoute(routePoints, from, to, isEnd);
    },
    [routePoints, waypointStops],
  );
  const movePoint = useCallback(
    (from: number, to: number) => {
      const next = moved(from, to);
      if (next) setRoute(next);
    },
    [moved, setRoute],
  );
  // Whether a move may be made at all, asked as a point is carried: the
  // list offers no drop line where it may not go, and the menu no Move.
  const canMove = useCallback((from: number, to: number) => moved(from, to) !== null, [moved]);
  // An airport made another from its menu's Change, the one search's
  // pick; only a point the same as its neighbour's is let go, a leg of none.
  const replacePoint = useCallback(
    (at: number, ident: string) => {
      const replaced = replacedRoute(routePoints, at, ident);
      if (replaced) setRoute(replaced);
    },
    [routePoints, setRoute],
  );
  const listEdit = useMemo(
    () => ({ onMove: movePoint, canMove, onAddAt: typeStopAt, onReplace: replacePoint }),
    [movePoint, canMove, typeStopAt, replacePoint],
  );
  return { waypointStops, routeOpen, setRouteOpen, addAt, setAddAt, typeStopAt, listEdit };
}
