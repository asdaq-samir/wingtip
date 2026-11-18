import { useEffect, useRef, type ReactNode } from "react";
import { create } from "zustand";
import { isPosition } from "../../lib/identSchema";
import { useRouteOnly } from "../../lib/map/routeOnly";
import { sameField } from "../../lib/procedures";
import { pointEnd } from "./pointEnd";
import { RouteGrid, type RouteItem } from "./RouteGrid";
import { RouteSheets } from "./RouteSheets";
import { TimelineLine, TimelineMark, type TimelinePoint } from "./TimelineLine";
import { listedPoints } from "./stopsRow";
import { AddStopRow, StopsRow, TIMELINE_CARD } from "./TimelineRows";
import { visitRow } from "./visits";
import type { ProceduresRouteProps } from "./routeProps";
import { toggleField, useProceduresRoute } from "./useProceduresRoute";

export type { TimelinePoint } from "./TimelineLine";

/** The one line open to its runways and procedures, by its key, kept
 *  while the page is: the timeline is drawn again as the sheet moves. The
 *  open line's key is for the route it was opened on (`route`): a line's
 *  key is its place, and a route changed puts another point there. */
const useOpenLine = create<{ key: string | null; route: string }>(() => ({ key: null, route: "" }));

/** The stops' row tapped, its focus to go to the first stop once they are
 *  listed: a holder, as the timeline may be drawn anew as the sheet goes up. */
const focusStops = { asked: false };

/**
 * FPL's route on the ground (the one layout, decision 0046; the owner's
 * two-row timeline, 2026-11-17: "Yes let's try that"), where it is read
 * and edited at once, the sheet at half: one grouped list, Apple Maps'
 * Directions' look, a line a point (TimelineLine). React Aria's GridList
 * carries the list (RouteGrid): a hold or the grip moves a point, the
 * keyboard's and VoiceOver's moves its drag button's; a stop is taken out
 * by its menu's Remove (the plan's toast Undo puts it back);
 * the mark is the point's menu (PointMenu: Change by the one search,
 * Direct To, Set Altitude, Hold, Add a Stop After, Move, Remove). A tap on
 * a field's line opens it, Base UI's Collapsible: its wind and elevation,
 * then its runway and procedure chips -- Base UI's menus (RunwayTray,
 * ProcedureMenu) -- one line open at a time, the map centred on it above
 * the sheet with the route's points alone (lib/map/routeOnly). Below
 * full, two stops or more between the ends are one row of the card, "2
 * Stops" and their idents (StopsRow), a tap taking the sheet all the way
 * up, where every stop is its own row and there is no stops' row (the
 * owner, 2026-11-18: "let's just show the stops as another row in between.
 * And when the card is full, no need to show that because it expands to
 * show all the stops"); one stop is its own row (listedPoints). A stop
 * whose line is open, or that cannot be flown to, keeps them listed, and a
 * point moved in among them takes the sheet up, so it is never moved out
 * of sight. Add a Stop is the last row, asking the one search;
 * before the route is whole, half a route's other end to pick and the
 * route typed (FPL's RouteTimeline, its `head`, `tail` and `foot`). The sheets the
 * route opens are its (RouteSheets). In a dry run it is read, no line
 * opening and no menus, every stop listed.
 */
export default function TimelineRoute({
  points,
  head,
  tail,
  foot,
  allStops,
  onAllStops,
  ...props
}: ProceduresRouteProps & {
  points: TimelinePoint[];
  /** Rows before the points' and after them, in the card: half a route's
   *  end still to pick (EndRow), the line running on to and from it. */
  head?: ReactNode;
  tail?: ReactNode;
  /** The card's last row where it is not Add a Stop: before the route is
   *  whole, the route typed or pasted (TypeRouteRow). */
  foot?: ReactNode;
  /** Every stop its own row: the sheet at full, or the route read. */
  allStops: boolean;
  /** The sheet taken all the way up, where every stop is listed. */
  onAllStops: () => void;
}) {
  const vm = useProceduresRoute(props);
  const { airports, routePoints, stopsFull } = vm;
  const keyOf = (p: TimelinePoint) => `${p.role}:${p.ident}:${p.index}`;
  const route = routePoints.join(" ");
  const openKey = useOpenLine((s) => (s.route === route ? s.key : null));
  useEffect(() => {
    if (useOpenLine.getState().route !== route) useOpenLine.setState({ route, key: null });
  }, [route]);
  const stops = points.slice(1, -1);
  // A pilot's one open stop keeps them listed; the specs' fields, each
  // open at first (openAtFirst), list them all as they work on them; a
  // stop that cannot be flown to keeps its why in sight (decision 0043).
  const all = allStops || vm.openAtFirst || stops.some((p) => p.problem || openKey === keyOf(p));
  const shown = listedPoints(points, all);
  const folded = shown.includes(null);
  // A point moved, from its menu or by a drop beside an end, in among
  // stops that are one row takes the sheet up to list them: one carried
  // among them is not hidden in the row.
  const edit = vm.edit && {
    ...vm.edit,
    onMove: (from: number, to: number) => {
      if (folded && to > 0 && to < routePoints.length - 1) onAllStops();
      vm.edit!.onMove(from, to);
    },
  };
  const moving = { ...vm, edit };
  const open = points.find((p) => keyOf(p) === openKey) ?? null;
  // The map: the route's points alone and the open line's centred.
  const focus = open && edit ? open.ident : null;
  useEffect(() => {
    useRouteOnly.setState({ on: focus !== null, focus });
  }, [focus]);
  useEffect(() => () => useRouteOnly.setState({ on: false, focus: null }), []);
  // The stops' row tapped: the focus, which went with the row, on the
  // first stop's row once the sheet is up and they are listed -- a frame
  // on, after React Aria's list has put it on the row after the one gone.
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (folded || !focusStops.asked) return;
    const ident = CSS.escape(stops[0]?.ident ?? "");
    const frame = requestAnimationFrame(() => {
      focusStops.asked = false;
      card.current?.querySelector(`[data-testid=timeline-line][data-ident="${ident}"]`)?.closest<HTMLElement>("[role=row]")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  });
  const items: RouteItem[] = shown.map((point, i) => {
    if (!point)
      return {
        id: "stops",
        label: `${stops.length} stops`,
        node: (
          <StopsRow
            idents={stops.map((p) => p.ident)}
            onShowAll={() => {
              focusStops.asked = true;
              onAllStops();
            }}
          />
        ),
      };
    const field = point.field ? airports.find((a) => a.role === point.role && sameField(a.ident, point.ident)) : undefined;
    // Its visit's row of the nav log, for its tanks, its leg's altitude and
    // a hold's course in: a point the route is at twice has two (visitRow).
    const row = visitRow(vm.rows, point.role, point.ident, point.seen);
    const end = pointEnd(moving, point.ident, {
      time: point.time,
      waypoint: !point.field && !isPosition(point.ident),
      elevationFt: field?.elevationFt ?? null,
      to: point.role !== "Departure",
      stop: point.role === "Stop",
      holdable: point.role === "Destination" || (!point.field && !isPosition(point.ident)),
      row,
      index: point.index,
      visit: point.visit,
    });
    const mark = <TimelineMark point={point} position={isPosition(point.ident)} more={!!edit} />;
    const key = keyOf(point);
    return {
      id: key,
      label: point.ident,
      point: edit ? point.index : undefined,
      node: (
        <TimelineLine
          vm={moving}
          point={point}
          row={row}
          field={field}
          end={end}
          mark={edit ? end.menu(mark, true) : mark}
          first={i === 0 && !head}
          last={i === shown.length - 1 && !tail}
          // The browser specs' fields open at first, each its own
          // (useProceduresRoute's openAtFirst), as they work on their
          // runways and procedures; a pilot's one at a time.
          open={vm.openAtFirst ? vm.isOpen(key) : openKey === key}
          onOpen={(next) =>
            vm.openAtFirst ? toggleField(key, point.ident, next) : useOpenLine.setState({ key: next ? key : null, route })
          }
        />
      ),
    };
  });
  const list = (
    <div ref={card} className={TIMELINE_CARD} data-testid="route-summary">
      {head}
      <RouteGrid items={items} onMove={edit?.onMove} canMove={edit?.canMove} />
      {tail}
      {foot ?? (edit && routePoints.length > 1 && <AddStopRow disabled={stopsFull} onClick={() => edit.onAddAt(routePoints.length - 1)} />)}
    </div>
  );
  // Read in a dry run, the list read under it has the sheets.
  return edit ? <RouteSheets vm={vm}>{list}</RouteSheets> : list;
}
