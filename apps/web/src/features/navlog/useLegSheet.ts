import { useCallback, useMemo, useState } from "react";
import type { Candidate } from "../../lib/api/types";
import { sameField } from "../../lib/procedures";
import { pickOnMap, useMapPickOwner } from "../../lib/map/mapPick";
import { useFlyingTo, navLogRows, routeLegs, type PlanAnswer, type PlanCourse } from "../plan";
import type { RouteLegView } from "./RouteLegCard";

/** A stop row's place among the route's points (the departure 0, the first
 *  stop 1), for removeStop to take out the visit tapped, not the first of
 *  a field the route is at twice. */
export function stopPlace(rows: readonly { kind: string }[], row: { kind: string }): number {
  return 1 + rows.filter((r) => r.kind === "stop").indexOf(row);
}

/**
 * The point and the leg picked (usePlanWorkspace): whichever waypoint is
 * focused, by the map's marker or the nav log's row alike, and the leg of
 * the course line tapped on the map, with its Route Leg sheet's figures
 * and actions.
 */
export function useLegSheet({
  routeKey,
  course,
  logSelected,
  legs,
  dryRunning,
  directParam,
  directToPoint,
  removeStop,
}: {
  /** The route the selection is kept for: a new route starts with nothing selected. */
  routeKey: string;
  course: PlanCourse | null;
  /** The checkpoints in the nav log (usePlan's `logSelected`). */
  logSelected: PlanAnswer["logSelected"];
  legs: PlanAnswer["legs"];
  /** The dry run flying, if it is (useDryRun's `running`). */
  dryRunning: Parameters<typeof useFlyingTo>[0];
  /** The point a Direct to goes to (`direct`). */
  directParam: string | null;
  directToPoint: (ident: string | null) => void;
  removeStop: (ident: string, at?: number) => void;
}) {
  // Whichever waypoint is focused -- by its own coordinates, not a row
  // index, since the map's markers and the nav log's rows are two
  // orderings of the same points -- and only for the route it was
  // picked on: a new route starts with nothing selected.
  const [selection, setSelection] = useState<{ route: string; point: { lat: number; lon: number } } | null>(null);
  const selectedPoint = selection?.route === routeKey ? selection.point : null;
  const selectPoint = useCallback(
    (point: { lat: number; lon: number } | null) => setSelection(point && { route: routeKey, point }),
    [routeKey],
  );
  // The map's own half of point selection -- clicking a checkpoint
  // marker focuses the same point the matching nav log row would.
  const selectCandidate = useCallback((c: Candidate) => selectPoint({ lat: c.lat, lon: c.lon }), [selectPoint]);
  const selectPointAt = useCallback((lat: number, lon: number) => selectPoint({ lat, lon }), [selectPoint]);
  const deselectPoint = useCallback(() => selectPoint(null), [selectPoint]);
  // Its ring put away by any other pick, a tap on the chart, or the card
  // it was picked with closing (lib/map/mapPick, GlMapShell's openCard):
  // it was kept till the route changed, a second yellow ring beside the
  // next field picked (the selection audit, 2026-11-18).
  useMapPickOwner("point", !!selectedPoint, deselectPoint);
  // The route in order in FPL, the nav log's place: its fields with their
  // runways and procedures, and the tops of climb and descent and the
  // fixes flown through, by the nav log's rows.
  const routeRows = useMemo(() => navLogRows(course, logSelected, legs), [course, logSelected, legs]);
  // The route's legs as the map's course line is tapped by (RouteGl), and
  // the one tapped, by the row it arrives at, for its Route Leg sheet: its
  // figures the nav log's leg's, the engine's; Direct to its end as the
  // route list's (directToPoint), a stop's Remove as the route list's
  // (removeStop); Active Leg where flying mode is flying it (useFlyingTo).
  // Fly Leg, ForeFlight's third action, is not here: the planner has no
  // way to make a leg the active one but flying it.
  const mapLegs = useMemo(() => routeLegs(routeRows), [routeRows]);
  const [legAt, setLegAt] = useState<string | null>(null);
  const flyingTo = useFlyingTo(dryRunning, routeRows, course?.course_line);
  const openLeg = useMemo<RouteLegView | null>(() => {
    const at = mapLegs.find((l) => l.key === legAt);
    if (!at) return null;
    const row = at.toRow;
    const ident = row.kind === "checkpoint" ? null : row.airport.ident;
    const on = ident !== null && directParam !== null && sameField(directParam, ident);
    return {
      key: at.key,
      from: at.from.name,
      to: at.to.name,
      distanceNm: at.leg?.distance_nm ?? null,
      courseMagDeg: at.leg?.magnetic_course_deg ?? null,
      active: flyingTo === at.key,
      direct:
        ident === null
          ? null
          : {
              on,
              go: () => {
                directToPoint(on ? null : ident);
                setLegAt(null);
              },
            },
      remove:
        row.kind === "stop"
          ? () => {
              removeStop(row.airport.ident, stopPlace(routeRows, row));
              setLegAt(null);
            }
          : null,
    };
  }, [mapLegs, routeRows, legAt, directParam, flyingTo, directToPoint, removeStop]);
  const closeLeg = useCallback(() => setLegAt(null), []);
  // A leg's sheet is one pick as every card is (lib/map/mapPick).
  const selectLeg = useCallback((key: string | null) => {
    if (key) pickOnMap("leg");
    setLegAt(key);
  }, []);
  useMapPickOwner("leg", !!legAt, closeLeg);
  return { selectedPoint, selectCandidate, selectPointAt, deselectPoint, routeRows, mapLegs, setLegAt: selectLeg, openLeg, closeLeg };
}
