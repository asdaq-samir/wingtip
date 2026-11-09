import { useCallback, useMemo, useState } from "react";
import type { Detour } from "../../../lib/api/types";
import { identOf, isAirwayToken, isPosition } from "../../../lib/identSchema";
import type { RouteParts } from "../components/RouteBox";
import type { PlanCourse } from "./planTypes";

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

/** The route's points with the one at `at` made `ident`, as typed (its
 *  card's ident, In the Plan): null where it is empty or the same as its
 *  neighbour's, a leg of none. */
export function replacedRoute(points: string[], at: number, ident: string): RouteParts | null {
  if (at < 0 || at >= points.length) return null;
  const next = [...points];
  next[at] = ident.trim().toUpperCase();
  if (!next[at] || next.some((p, i) => i > 0 && p === next[i - 1])) return null;
  return { dep: next[0]!, stops: next.slice(1, -1), dest: next.at(-1)! };
}

/** The route's points with `ident` put in at `at`: null where it is the
 *  same as its neighbour's. */
export function insertedRoute(points: string[], at: number, ident: string): RouteParts | null {
  const next = [...points];
  next.splice(at, 0, ident.trim().toUpperCase());
  if (next.some((p, i) => i > 0 && p === next[i - 1])) return null;
  return { dep: next[0]!, stops: next.slice(1, -1), dest: next.at(-1)! };
}

/**
 * FPL's list of the route's points changed in place (usePlanWorkspace):
 * a point dragged to another's place, made another from its card, a stop
 * typed in at its place -- by an empty card In the Plan, by the route's
 * box otherwise -- and which stops are flown through rather than landed at.
 */
export function useRouteListEdit({ stops, course, routeEdit, routePoints, setRoute, setAddingStop }: {
  /** The route's stops as typed. */
  stops: string[];
  course: PlanCourse | null;
  /** How the route is changed (the RouteEdit setting). */
  routeEdit: string;
  /** The route's points as typed, the departure first. */
  routePoints: string[];
  setRoute: (parts: RouteParts) => void;
  setAddingStop: (adding: false | "stop" | "via") => void;
}) {
  // The stops flown through rather than landed at: the course's own word
  // for each, and before it answers, any ident too long for an airport.
  // An airway (V100) is flown through too, fix by fix, unless the course
  // says the stop is an airport whose identifier has an airway's form.
  const waypointStops = useMemo(() => new Set(stops.filter(stop =>
    course?.stops?.some(a => a.ident === stop && a.kind === "fix") || !identOf(stop)
    || (isAirwayToken(stop) && !course?.stops?.some(a => a.ident === stop)))), [stops, course]);
  // A whole route's box opened again from its folded line (RouteEdit's
  // "folded"), till its Done; and where a stop asked for from FPL's list
  // is typed in (its Add a Stop, a point's Add a Stop After).
  const [routeOpen, setRouteOpen] = useState(false);
  const [addAt, setAddAt] = useState<number | null>(null);
  // In the Plan, a stop added as an empty card at its place in the list,
  // with no route box (the owner, 2026-11-05: "I want to completely get rid
  // of the route box for in the plan, when adding a stop just add a stop
  // with the editable card").
  const [newStopAt, setNewStopAt] = useState<number | null>(null);
  // Fly via's ways round the Class B, offered on that card.
  const [newStopVia, setNewStopVia] = useState<Detour[] | null>(null);
  const typeStopAt = useCallback((index: number) => {
    if (routeEdit === "plan") {
      setNewStopAt(index);
      return;
    }
    setAddAt(index);
    setAddingStop("stop");
  }, [routeEdit, setAddingStop]);
  // A point dragged by its grip in FPL's list onto another's place, as the
  // box's pills are dragged (movedRoute), and the route planned again.
  const movePoint = useCallback((from: number, to: number) => {
    const isEnd = (p: string) => (!!identOf(p) && !waypointStops.has(p)) || isPosition(p);
    const moved = movedRoute(routePoints, from, to, isEnd);
    if (moved) setRoute(moved);
  }, [routePoints, waypointStops, setRoute]);
  // A point made another from its card's ident (In the Plan): anything
  // typed, as the box takes it; only a point the same as its neighbour's
  // is let go, a leg of none.
  const replacePoint = useCallback((at: number, ident: string) => {
    const replaced = replacedRoute(routePoints, at, ident);
    if (replaced) setRoute(replaced);
  }, [routePoints, setRoute]);
  const insertPoint = useCallback((at: number, ident: string) => {
    setNewStopAt(null);
    setNewStopVia(null);
    const inserted = insertedRoute(routePoints, at, ident);
    if (inserted) setRoute(inserted);
  }, [routePoints, setRoute]);
  const cancelNewStop = useCallback(() => {
    setNewStopAt(null);
    setNewStopVia(null);
  }, []);
  const listEdit = useMemo(() => ({
    onMove: movePoint, onAddAt: typeStopAt, onReplace: replacePoint,
    newAt: newStopAt, newVia: newStopVia, onInsert: insertPoint, onCancelNew: cancelNewStop,
    // In the Plan, the points as cards (ProceduresRoute), each changed by
    // its own ident's text box, no menu's Change to a box.
    cards: routeEdit === "plan",
  }), [movePoint, typeStopAt, replacePoint, newStopAt, newStopVia, insertPoint, cancelNewStop, routeEdit]);
  return { waypointStops, routeOpen, setRouteOpen, addAt, setAddAt, setNewStopVia, typeStopAt, listEdit };
}
