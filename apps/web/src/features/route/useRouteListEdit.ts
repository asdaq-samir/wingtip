import { useCallback, useMemo, useState } from "react";
import { identOf, isAirwayToken, isPosition } from "../../lib/identSchema";
import type { RouteParts } from "./RouteBox";
import { placeAllowed, placeRefusal } from "./routeEdit";
import type { PlanCourse } from "../plan";
import { askSearchPick } from "../../lib/oneSearch";

/** The route's points with one moved from `from` to `to`, as FPL's list
 *  drags them: the ends kept airports or a position (`isEnd`), as the box
 *  keeps them -- a waypoint is flown through, never taken off from or
 *  landed at --, My Location (a position) at an end alone, where the
 *  route starts from or comes back to where the airplane is, never a stop
 *  on the way, and no point beside the same (placeAllowed); null where the
 *  move would break any. */
export function movedRoute(points: string[], from: number, to: number, isEnd: (point: string) => boolean): RouteParts | null {
  const next = reordered(points, from, to);
  if (!next || !isEnd(next[0]!) || !isEnd(next.at(-1)!)) return null;
  return partsIfAllowed(next);
}

/** Why a move is refused, said under the point carried: My Location to a
 *  stop's place (placeRefusal). Null for a move let through, or one
 *  refused unsaid, where the list offers no drop line (a waypoint at an
 *  end, a point beside the same). */
export function moveRefusal(points: string[], from: number, to: number): string | null {
  const next = reordered(points, from, to);
  return next ? placeRefusal({ dep: next[0]!, stops: next.slice(1, -1), dest: next.at(-1)! }) : null;
}

/** The points with the one at `from` put at `to`; null where there is none. */
function reordered(points: string[], from: number, to: number): string[] | null {
  const next = [...points];
  const [moved] = next.splice(from, 1);
  if (moved === undefined || next.length < 1) return null;
  next.splice(to, 0, moved);
  return next;
}

/** The points as the route's parts where each may go there (placeAllowed). */
function partsIfAllowed(next: string[]): RouteParts | null {
  const parts = { dep: next[0]!, stops: next.slice(1, -1), dest: next.at(-1)! };
  return placeAllowed(parts) ? parts : null;
}

/** The route's points with the one at `at` made `ident` (its menu's
 *  Change, the one search's pick): null where it is empty or may not go
 *  there (placeAllowed: the same as its neighbour's, or My Location as a
 *  stop). */
export function replacedRoute(points: string[], at: number, ident: string): RouteParts | null {
  if (at < 0 || at >= points.length) return null;
  const next = [...points];
  next[at] = ident.trim().toUpperCase();
  return next[at] ? partsIfAllowed(next) : null;
}

/** The route's points with `ident` put in at `at` (Add a Stop): null
 *  where it may not go there (placeAllowed). */
export function addedRoute(points: string[], at: number, ident: string): RouteParts | null {
  if (at < 1 || at >= points.length) return null;
  const next = [...points.slice(0, at), ident.trim().toUpperCase(), ...points.slice(at)];
  return next[at] ? partsIfAllowed(next) : null;
}

/** The route with an end it lacks picked (FPL's timeline's Departure or
 *  Destination row, the one search's pick): an airport in capitals, or My
 *  Location (a position) as it is. */
export function endedRoute(parts: RouteParts, role: "Departure" | "Destination", picked: string): RouteParts {
  const ident = isPosition(picked) ? picked : picked.trim().toUpperCase();
  return role === "Departure" ? { ...parts, dep: ident } : { ...parts, dest: ident };
}

/**
 * FPL's list of the route's points changed in place (usePlanWorkspace),
 * while the route is open to edit (the one layout's expanded list; the
 * owner, 2026-11-17, decision 0047): a point dragged to another's place,
 * made another from its menu's Change, a stop typed in at its place by
 * the route's field (RouteBox's `addAt`), an end it lacks picked -- and
 * which stops are flown through rather than landed at.
 */
export function useRouteListEdit({
  dep,
  dest,
  stops,
  course,
  routePoints,
  setRoute,
}: {
  /** The route's ends and stops as typed. */
  dep: string;
  dest: string;
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
        stop: true,
        onPick: (picked) => {
          const added = addedRoute(routePoints, index, picked);
          if (added) setRoute(added);
        },
      });
    },
    [routePoints, setRoute],
  );
  // An end the route lacks (a new plan, half a route), from its row on
  // FPL's timeline: by the one search, as a point is changed, My Location
  // offered first, as Maps' From offers it -- but not where the route is
  // at My Location already, its other end (the owner, 2026-11-20: "Why
  // show my location for destination when it's already picked for
  // departure").
  const pickEnd = useCallback(
    (role: "Departure" | "Destination") => {
      askSearchPick({
        label: role,
        fixes: false,
        position: !routePoints.some(isPosition),
        onPick: (picked) => setRoute(endedRoute({ dep, stops, dest }, role, picked)),
      });
    },
    [dep, stops, dest, routePoints, setRoute],
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
  // A move refused with a reason (moveRefusal: My Location to a stop's
  // place): the list as it was, and why under the point carried, till the
  // route changes (the owner, 2026-11-18; lib/problems: said where it
  // happens, no toast).
  const [refused, setRefused] = useState<{ route: string; index: number; note: string } | null>(null);
  const routeKey = routePoints.join(" ");
  const movePoint = useCallback(
    (from: number, to: number) => {
      const next = moved(from, to);
      const note = next ? null : moveRefusal(routePoints, from, to);
      setRefused(note ? { route: routeKey, index: from, note } : null);
      if (next) setRoute(next);
    },
    [moved, routePoints, routeKey, setRoute],
  );
  // Whether a move may be made at all, asked as a point is carried: the
  // menu offers no Move where it may not go. The list offers a drop line
  // there too where the refusal is said (canDrop), so the drop is made,
  // the list stays as it was and the note says why.
  const canMove = useCallback((from: number, to: number) => moved(from, to) !== null, [moved]);
  const canDrop = useCallback(
    (from: number, to: number) => canMove(from, to) || moveRefusal(routePoints, from, to) !== null,
    [canMove, routePoints],
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
    () => ({
      onMove: movePoint,
      canMove,
      canDrop,
      refusal: refused?.route === routeKey ? { index: refused.index, note: refused.note } : null,
      onAddAt: typeStopAt,
      onReplace: replacePoint,
    }),
    [movePoint, canMove, canDrop, refused, routeKey, typeStopAt, replacePoint],
  );
  return { waypointStops, routeOpen, setRouteOpen, addAt, setAddAt, typeStopAt, pickEnd, listEdit };
}
