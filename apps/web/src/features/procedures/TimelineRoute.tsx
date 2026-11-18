import { useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { create } from "zustand";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { isPosition } from "../../lib/identSchema";
import { useRouteOnly } from "../../lib/map/routeOnly";
import { sameField } from "../../lib/procedures";
import { pointEnd } from "./pointEnd";
import { RouteGrid, type RouteItem } from "./RouteGrid";
import { AddStopRow } from "./RouteRows";
import { RouteSheets } from "./RouteSheets";
import { TimelineLine, TimelineMark, type TimelinePoint } from "./TimelineLine";
import type { ProceduresRouteProps } from "./routeProps";
import { toggleField, useProceduresRoute } from "./useProceduresRoute";

export type { TimelinePoint } from "./TimelineLine";

/** The one line open to its runways and procedures, by its key, and the
 *  stops unfolded, kept while the page is: the timeline is drawn again as
 *  the sheet moves. */
const useOpenLine = create<{ key: string | null; stops: boolean }>(() => ({ key: null, stops: false }));

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
 * the sheet with the route's points alone (lib/map/routeOnly). Any stops
 * between the two ends fold into a small pill on the hairline, "2 stops", a tap unfolding
 * them and another folding them again (the owner, 2026-11-17: "With any
 * stops in between dep and dest, we can fold the stops by saying how many
 * stops etc and then unfold when tapped"); a stop whose line is open
 * keeps them unfolded. Add a Stop is the last row, asking the one search. The sheets the
 * route opens are its (RouteSheets). In a dry run it is read, no line
 * opening and no menus.
 */
export default function TimelineRoute({ points, ...props }: ProceduresRouteProps & { points: TimelinePoint[] }) {
  const vm = useProceduresRoute(props);
  const { airports, edit, routePoints, stopsFull } = vm;
  const keyOf = (p: TimelinePoint) => `${p.role}:${p.ident}:${p.index}`;
  const openKey = useOpenLine((s) => s.key);
  const all = useOpenLine((s) => s.stops);
  const open = points.find((p) => keyOf(p) === openKey) ?? null;
  // The map: the route's points alone and the open line's centred.
  const focus = open && edit ? open.ident : null;
  useEffect(() => {
    useRouteOnly.setState({ on: focus !== null, focus });
  }, [focus]);
  useEffect(() => () => useRouteOnly.setState({ on: false, focus: null }), []);
  const stops = points.slice(1, -1);
  const count = stops.length;
  const stopOpen = stops.some((p) => (vm.openAtFirst ? vm.isOpen(keyOf(p)) : openKey === keyOf(p)));
  const unfolded = all || stopOpen;
  // The ends, and between them the stops' one line: the stops after it
  // where unfolded, as a disclosure row's rows follow it.
  const shown = count === 0 ? points : [points[0]!, null, ...(unfolded ? stops : []), points.at(-1)!];
  const items: RouteItem[] = shown.map((point, i) => {
    if (!point) {
      const words = `${count} ${count === 1 ? "stop" : "stops"}`;
      return {
        id: "stops",
        label: words,
        node: (
          // A small pill on the hairline between the lines either side of
          // it, no row of its own (the owner, 2026-11-17: "Instead of stops
          // row can we make a small pill at the separator"): the stock
          // secondary button at its smallest, rounded, at the text's start,
          // its 44-point area a pseudo-element over the hairline. The line
          // under it draws the hairline it sits on.
          <div className="relative z-10 h-0">
            <Button
              variant="secondary"
              size="xs"
              // Folding them closes a stop's open line with them.
              onClick={() => useOpenLine.setState(unfolded ? { stops: false, key: stopOpen ? null : openKey } : { stops: true })}
              aria-expanded={unfolded}
              data-testid="timeline-more"
              className="absolute top-0 left-11 -translate-y-1/2 rounded-full after:absolute after:-inset-x-2 after:-inset-y-2.5 after:content-['']"
            >
              {words}
              <ChevronDown
                className={cn("size-3.5 transition-transform motion-reduce:transition-none", unfolded && "rotate-180")}
                aria-hidden
              />
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
    // Never wider than the sheet: a row laid out past the card is clipped,
    // not a sideways scroll of the panel (the iOS audit's rule).
    <div className="overflow-x-clip rounded-(--radius-banner) bg-card px-3" data-testid="route-summary">
      <RouteGrid items={items} onMove={edit?.onMove} canMove={edit?.canMove} />
      {edit && routePoints.length > 1 && <AddStopRow disabled={stopsFull} onClick={() => edit.onAddAt(routePoints.length - 1)} />}
    </div>
  );
  // Read in a dry run, the list read under it has the sheets.
  return edit ? <RouteSheets vm={vm}>{list}</RouteSheets> : list;
}
