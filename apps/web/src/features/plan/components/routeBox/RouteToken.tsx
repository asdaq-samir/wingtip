import { Fragment } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "cn";
import { TEXT } from "../../../../lib/text";
import type { FuelStopSuggestion } from "../../../../lib/api/types";
import { Button } from "../../../../components/ui/button";
import { identOf } from "../../../../lib/identSchema";
import type { AirspaceClass } from "../../../../lib/preferences";
import { sameField } from "../../../../lib/procedures";
import type { PointAltitude } from "../PointAltitudeDialog";
import { FuelStopChip, ProcedureChip, type RouteProcedure } from "./RouteChips";
import RoutePill from "./RoutePill";

/** What every point's token draws from: the route, what is said about its
 *  points, and what a tap on one of them does. */
interface TokenBox {
  points: string[];
  waypoints: Set<string>;
  hasDep: boolean;
  hasDest: boolean;
  /** No more stops than the planner takes: the arrows that add one off. */
  full: boolean;
  roleOf: (i: number) => "dep" | "stop" | "dest";
  /** The field taken, and what is typed after the last point, for the
   *  arrow on from the destination and the words where an end is missing. */
  focused: boolean;
  typedAtEnd: boolean;
  typedAtStart: boolean;
  procedures: RouteProcedure[];
  onProcedures?: (procedure: RouteProcedure) => void;
  fuelStops: FuelStopSuggestion[];
  onKeepFuelStops?: (after: string, idents: string[]) => void;
  onHideFuelStop?: (ident: string) => void;
  airspaceOf: (ident: string) => AirspaceClass | undefined;
  metarColourOf: (ident: string) => string | undefined;
  altitudeAt: (ident: string, waypoint: boolean) => PointAltitude;
  unknown: string | null;
  onOpenAirport?: (ident: string) => void;
  directTo: string | null;
  onDirectTo?: (ident: string | null) => void;
  /** The points as a new list, the ends where they were. */
  change: (list: string[]) => void;
  remove: (i: number) => void;
  editAltitude: (ident: string) => void;
  /** The arrow before point `before` tapped: a stop asked for there. */
  arrowAt: (before: number) => void;
}

const ARROW = "size-3 shrink-0 text-muted-foreground";
// A missing end's word, where its field was: in the field's grey, at the
// field's size, a row's (TEXT.row: 16 at the least, so as not to be
// smaller than what is typed beside it, 17 to a finger).
const ASKING = cn("px-1 font-sans normal-case text-muted-foreground", TEXT.row);

/**
 * One point of the route in the box, as a token of its TokenField: the
 * arrow into it (a tap asks for a stop there), its arrival and approach
 * before it, as they are flown into it, at the owner's ask ("I want to
 * show the approach pill before the corresponding airport pill"), its
 * pill, its departure after it, and the fuel stops suggested for the
 * flight that leaves it. The last carries the arrow on from it while the
 * box is typed in, and the words for a missing destination; the first,
 * with no departure, the word for it. The chips are not points of the
 * route: not dragged, not typed, a tap opens the Procedures they were
 * picked in.
 */
export default function RouteToken({ i, box }: { i: number; box: TokenBox }) {
  const { points, waypoints, hasDep, hasDest, procedures, fuelStops } = box;
  const point = points[i];
  // A token the route has no point for: none drawn (the field and the
  // route are set together, so none is looked for).
  if (point === undefined) return null;
  const last = i === points.length - 1;
  // A field's chips once, at its first pill, when it is in the route twice.
  const first = i === points.indexOf(point);
  const procs = first ? procedures.filter((p) => sameField(p.ident, point)) : [];
  const waypoint = waypoints.has(point);
  const unknown = box.unknown === point;
  const fuel = !last && first ? fuelStops.filter((f) => sameField(f.departure, point)).slice(0, 1) : [];
  return (
    // In the sheet's own type, as the box's pills were, not the field's
    // (the idents typed are in capitals in the monospace), and its own
    // white space collapsed: the field keeps every space typed
    // (white-space: pre), which in a pill took 12 points beside its ident
    // and put the next arrow's hit area over it.
    // Every pill, chip and arrow `gap-2` apart, each one's 44-point area
    // reaching half way across the gap to meet its neighbour's, not under
    // it: the arrow between C81 and KDLH was a 16 by 20 control whose area
    // the pills on both sides took (the audit's WEB-4).
    <span className="inline-flex items-center gap-x-2 align-middle font-sans leading-normal whitespace-nowrap normal-case">
      {/* Before the first point an arrow only with no departure yet: the
          departure is asked for there, the word for it in the same button,
          as a field's placeholder takes the tap that fills it -- a tap on
          the word put the caret at the route's end (the owner's
          screenshot, 2026-11-13). */}
      {(i > 0 || !hasDep) && (
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={box.full && !(i === 0 && !hasDep)}
          onClick={() => box.arrowAt(i)}
          data-testid="route-arrow"
          aria-label={i === 0 ? "Add the departure" : `Add a stop between ${points[i - 1]} and ${point}`}
          // The stock Button at the arrow's own size, in the grey, tinted under
          // a pointer, never grown: its area a pseudo-element 44 tall and
          // half the gap wider each side (ml-2 from the pill before it,
          // which ends the token before).
          className={cn(
            "h-5 w-4 rounded-full text-muted-foreground hover:bg-transparent hover:text-tint native:text-muted-foreground disabled:opacity-40",
            "after:-inset-x-1 after:-inset-y-3",
            i > 0 && "ml-2",
            i === 0 && "w-auto",
          )}
        >
          {i === 0 && !box.typedAtStart && <span className={ASKING}>Departure</span>}
          <ArrowRight className="size-3" />
        </Button>
      )}
      {procs
        .filter((p) => p.kind !== "departure")
        .sort((a, b) => (a.kind === "arrival" ? 0 : 1) - (b.kind === "arrival" ? 0 : 1))
        .map((p) => (
          <ProcedureChip
            key={`${p.kind}-${p.label}`}
            procedure={p}
            before
            onOpen={box.onProcedures ? () => box.onProcedures!(p) : undefined}
          />
        ))}
      <RoutePill
        // A place earlier or later: the two neighbours swapped.
        onStep={(by) => box.change(points.map((p, j) => (j === i ? points[i + by]! : j === i + by ? point : p)))}
        last={last}
        ident={point}
        waypoint={waypoint}
        index={i}
        airspaceOf={box.airspaceOf}
        metarColourOf={box.metarColourOf}
        role={box.roleOf(i)}
        stopNumber={i + (hasDep ? 0 : 1)}
        onChange={(ident) => box.change(points.map((p, j) => (j === i ? ident : p)))}
        altitude={box.altitudeAt(point, waypoint)}
        onEditAltitude={() => box.editAltitude(point)}
        onRemove={() => box.remove(i)}
        unknown={unknown}
        onOpen={box.onOpenAirport && !waypoint && identOf(point) && !unknown ? () => box.onOpenAirport!(identOf(point)) : undefined}
        // Flown to: a stop or the destination, not where it starts.
        direct={box.directTo !== null && sameField(box.directTo, point)}
        onDirect={
          box.onDirectTo && i > 0 && hasDep
            ? () => box.onDirectTo!(box.directTo !== null && sameField(box.directTo, point) ? null : point)
            : undefined
        }
      />
      {procs
        .filter((p) => p.kind === "departure")
        .map((p) => (
          <ProcedureChip key={`${p.kind}-${p.label}`} procedure={p} onOpen={box.onProcedures ? () => box.onProcedures!(p) : undefined} />
        ))}
      {/* The fuel stops suggested for the flight that leaves this point,
          dashed after it as the route goes on to them (FuelStopChip). */}
      {fuel.flatMap((f) =>
        f.stops.map((stop) => (
          <Fragment key={`fuel-${stop.ident}`}>
            <ArrowRight className={ARROW} aria-hidden="true" />
            <FuelStopChip
              ident={stop.ident}
              reason={f.reason}
              onAdd={
                box.onKeepFuelStops
                  ? () =>
                      box.onKeepFuelStops!(
                        point,
                        f.stops.map((s) => s.ident),
                      )
                  : undefined
              }
              onHide={box.onHideFuelStop ? () => box.onHideFuelStop!(stop.ident) : undefined}
            />
          </Fragment>
        )),
      )}
      {/* After the last point: with no destination yet, an arrow on to it;
          with one, an arrow on from it while the box is typed in, at the
          pilot's ask -- what is typed there is the new destination, the old
          one a stop. */}
      {last && (!hasDest || box.focused || box.typedAtEnd) && (
        <ArrowRight className={ARROW} aria-hidden="true" data-testid="route-arrow-on" />
      )}
      {last && !hasDest && !box.typedAtEnd && (
        <span aria-hidden="true" className={ASKING}>
          Destination
        </span>
      )}
    </span>
  );
}
