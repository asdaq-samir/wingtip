import { useCallback, useMemo, useState } from "react";
import { identOf, isAirwayToken, isPosition } from "../../lib/identSchema";
import type { RouteParts } from "./RouteBox";
import type { PlanCourse } from "../plan";

/** The route's points with one moved from `from` to `to`, as FPL's list
 *  drags them: the ends kept airports or a position (`isEnd`), as the box
 *  keeps them -- a waypoint is flown through, never taken off from or
 *  landed at -- and no point beside the same; null where the move would
 *  break either. */
export function movedRoute(points: string[], from: number, to: number, isEnd: (point: string) => boolean): RouteParts | null {
  const next = [...points];
  const [moved] = next.splice(from, 1);
  if (moved === undefined || next.length < 1) return null;
  next.splice(to, 0, moved);
  if (!isEnd(next[0]!) || !isEnd(next.at(-1)!) || next.some((p, i) => i > 0 && p === next[i - 1])) return null;
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
  setAddingStop,
}: {
  /** The route's stops as typed. */
  stops: string[];
  course: PlanCourse | null;
  /** The route's points as typed, the departure first. */
  routePoints: string[];
  setRoute: (parts: RouteParts) => void;
  setAddingStop: (adding: false | "stop" | "via") => void;
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
  // The route open to edit, its airport cards under its head, till its
  // Done; and where a stop asked for from FPL's list (its Add a Stop, a
  // point's Add a Stop After) is typed into the route's field.
  const [routeOpen, setRouteOpen] = useState(false);
  const [addAt, setAddAt] = useState<number | null>(null);
  const typeStopAt = useCallback(
    (index: number) => {
      setAddAt(index);
      setAddingStop("stop");
    },
    [setAddingStop],
  );
  // A point dragged by its grip (or held) in FPL's list onto another's
  // place, as the field's pills are moved (movedRoute), and the route
  // planned again.
  const movePoint = useCallback(
    (from: number, to: number) => {
      const isEnd = (p: string) => (!!identOf(p) && !waypointStops.has(p)) || isPosition(p);
      const moved = movedRoute(routePoints, from, to, isEnd);
      if (moved) setRoute(moved);
    },
    [routePoints, waypointStops, setRoute],
  );
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
    () => ({ onMove: movePoint, onAddAt: typeStopAt, onReplace: replacePoint }),
    [movePoint, typeStopAt, replacePoint],
  );
  return { waypointStops, routeOpen, setRouteOpen, addAt, setAddAt, typeStopAt, listEdit };
}
