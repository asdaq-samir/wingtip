import { useEffect, useState } from "react";
import { create } from "zustand";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { isPosition } from "../../lib/identSchema";
import { useRouteOnly } from "../../lib/map/routeOnly";
import { sameField } from "../../lib/procedures";
import { TEXT } from "../../lib/text";
import { pointEnd } from "./pointEnd";
import { RouteGrid, type RouteItem } from "./RouteGrid";
import { AddStopRow } from "./RouteRows";
import { RouteSheets } from "./RouteSheets";
import { TimelineLine, TimelineMark, type TimelinePoint } from "./TimelineLine";
import type { ProceduresRouteProps } from "./routeProps";
import { toggleField, useProceduresRoute } from "./useProceduresRoute";

export type { TimelinePoint } from "./TimelineLine";

/** Past this many lines the middle ones fold into one (the canvas's six). */
const MOST_LINES = 4;

/** The one line open to its runways and procedures, by its key, kept while
 *  the page is: the timeline is drawn again as the sheet moves. */
const useOpenLine = create<{ key: string | null }>(() => ({ key: null }));

/**
 * FPL's route on the ground (the one layout, decision 0046; the owner's
 * two-row timeline, 2026-11-17: "Yes let's try that"), where it is read
 * and edited at once, the sheet at half: one grouped list, Apple Maps'
 * Directions' look, a line a point (TimelineLine). React Aria's GridList
 * carries the list (RouteGrid): a hold or the grip moves a point, the
 * keyboard's and VoiceOver's moves its drag button's; SwipeRow takes a
 * stop out with a swipe to the left (the plan's toast Undo puts it back);
 * the mark is the point's menu (PointMenu: Change by the one search,
 * Direct To, Set Altitude, Hold, Add a Stop After, Move, Remove). A tap on
 * a field's line opens it, Base UI's Collapsible: its wind and elevation,
 * then its runway and procedure chips -- Base UI's menus (RunwayTray,
 * ProcedureMenu) -- one line open at a time, the map centred on it above
 * the sheet with the route's points alone (lib/map/routeOnly). Past four
 * points the middle ones fold into "N more stops", a tap showing them
 * all. Add a Stop is the last row, asking the one search. The sheets the
 * route opens are its (RouteSheets). In a dry run it is read, no line
 * opening and no menus.
 */
export default function TimelineRoute({ points, ...props }: ProceduresRouteProps & { points: TimelinePoint[] }) {
  const vm = useProceduresRoute(props);
  const { airports, edit, routePoints, stopsFull } = vm;
  const [all, setAll] = useState(false);
  const keyOf = (p: TimelinePoint) => `${p.role}:${p.ident}:${p.index}`;
  const openKey = useOpenLine((s) => s.key);
  const open = points.find((p) => keyOf(p) === openKey) ?? null;
  // The map: the route's points alone and the open line's centred.
  const focus = open && edit ? open.ident : null;
  useEffect(() => {
    useRouteOnly.setState({ on: focus !== null, focus });
  }, [focus]);
  useEffect(() => () => useRouteOnly.setState({ on: false, focus: null }), []);
  const folded = !all && points.length > MOST_LINES;
  const shown = folded ? [points[0]!, points[1]!, null, points.at(-1)!] : points;
  const items: RouteItem[] = shown.map((point, i) => {
    if (!point) {
      const count = points.length - 3;
      return {
        id: "more",
        label: `${count} more stops`,
        node: (
          <div className="flex gap-3">
            <span className="w-8 shrink-0" />
            <Button
              variant="plain"
              size="inline"
              onClick={() => setAll(true)}
              data-testid="timeline-more"
              className={cn("h-11 flex-1 border-t border-border text-muted-foreground", TEXT.row)}
            >
              {count} more {count === 1 ? "stop" : "stops"}
            </Button>
          </div>
        ),
      };
    }
    const field = point.field ? airports.find((a) => a.role === point.role && sameField(a.ident, point.ident)) : undefined;
    // Its row of the nav log, for its tanks, its leg's altitude and a hold's course in.
    const row = vm.rows.find((r) =>
      point.role === "Departure"
        ? r.kind === "departure"
        : point.role === "Destination"
          ? r.kind === "destination"
          : r.kind === "stop" && "airport" in r && sameField(r.airport.ident, point.ident),
    );
    const end = pointEnd(vm, point.ident, {
      time: point.time,
      waypoint: !point.field && !isPosition(point.ident),
      elevationFt: field?.elevationFt ?? null,
      to: point.role !== "Departure",
      stop: point.role === "Stop",
      holdable: point.role === "Destination" || (!point.field && !isPosition(point.ident)),
      row,
      index: point.index,
    });
    const mark = <TimelineMark point={point} position={isPosition(point.ident)} more={!!edit} />;
    const key = keyOf(point);
    return {
      id: key,
      label: point.ident,
      point: edit ? point.index : undefined,
      remove: edit ? end.remove : undefined,
      node: (
        <TimelineLine
          vm={vm}
          point={point}
          row={row}
          field={field}
          end={end}
          mark={edit ? end.menu(mark, true) : mark}
          first={i === 0}
          last={i === shown.length - 1}
          // The browser specs' fields open at first, each its own
          // (useProceduresRoute's openAtFirst), as they work on their
          // runways and procedures; a pilot's one at a time.
          open={vm.openAtFirst ? vm.isOpen(key) : openKey === key}
          onOpen={(next) => (vm.openAtFirst ? toggleField(key, point.ident, next) : useOpenLine.setState({ key: next ? key : null }))}
        />
      ),
    };
  });
  const list = (
    <div className="rounded-(--radius-banner) bg-card px-3" data-testid="route-summary">
      <RouteGrid items={items} onMove={edit?.onMove} />
      {edit && routePoints.length > 1 && <AddStopRow disabled={stopsFull} onClick={() => edit.onAddAt(routePoints.length - 1)} />}
    </div>
  );
  // Read in a dry run, the list read under it has the sheets.
  return edit ? <RouteSheets vm={vm}>{list}</RouteSheets> : list;
}
