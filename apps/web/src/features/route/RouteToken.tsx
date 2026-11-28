import { Fragment, type ReactNode } from "react";
import { cn } from "cn";
import { TEXT } from "../../lib/text";
import type { FuelStopSuggestion } from "../../lib/api/types";
import { Button } from "../../components/ui/button";
import { identOf, isPosition, pointName } from "../../lib/identSchema";
import { askSearchPick } from "../../lib/oneSearch";
import { sameField } from "../../lib/procedures";
import type { PointAltitude } from "./PointAltitudeDialog";
import { FuelStopChip, ProcedureChip, type RouteProcedure } from "./RouteChips";
import RoutePill from "./RoutePill";
import { FuelStopFold } from "./FuelStopFold";
import { fuelStopsAt } from "./fuelStopsAt";

/** What every point's token draws from: the route, what is said about its
 *  points, and what a tap on one of them does. */
interface TokenBox {
  points: string[];
  waypoints: Set<string>;
  hasDep: boolean;
  /** No more stops than the planner takes: Insert Before and After off. */
  full: boolean;
  roleOf: (i: number) => "dep" | "stop" | "dest";
  /** What is typed before the first point, for the departure's word. */
  typedAtStart: boolean;
  procedures: RouteProcedure[];
  onProcedures?: (procedure: RouteProcedure) => void;
  /** A field's Procedures of a kind, from its pill's menu. */
  onOpenProcedures?: (ident: string, kind: RouteProcedure["kind"]) => void;
  fuelStops: FuelStopSuggestion[];
  /** A flight's suggested stops kept, after the point at this place. */
  onKeepFuelStops?: (after: number, idents: string[]) => void;
  onHideFuelStop?: (ident: string) => void;
  /** The flights short of fuel with no stop offered, by their ends. */
  shortFlights: ShortFlight[];
  altitudeAt: (ident: string, waypoint: boolean) => PointAltitude;
  /** The point the planner does not know, and why, in words. */
  unknown: string | null;
  unknownWhy: string | null;
  onOpenAirport?: (ident: string) => void;
  onShowOnMap?: (ident: string) => void;
  directTo: string | null;
  onDirectTo?: (ident: string | null) => void;
  /** The points as a new list, the ends where they were. */
  change: (list: string[]) => void;
  /** Whether the box would take that list: a move offered only where so. */
  canChange: (list: string[]) => boolean;
  remove: (i: number) => void;
  editAltitude: (ident: string) => void;
  /** The one search asked for a point to go in before point `before`. */
  insertAt: (before: number) => void;
}

/** A flight short of fuel the planner offers no stop on (useSuggestedStops). */
interface ShortFlight {
  name: string;
  onBoard: boolean;
  departure: string;
  destination: string;
}

// One piece of a token, kept whole on its line: a pill, or a chip. Pieces
// wrap as words do, so a field with an arrival, an approach and a
// departure picked is never one run wider than the box; a chip keeps to its pill at a gap of 4, the next point 8 on, each
// gap at a piece's end, so a wrapped line starts at the left edge,
// as ForeFlight's pills read, in order with no arrows (the owner, 2026-11-23).
// Each piece's middle on the middle of the capitals typed beside it, not of
// their x-height, where `align-middle` alone puts it: the ident being typed
// after the last pill sat higher than the pills (the owner's iPhone,
// 2026-11-23), so the piece is raised by half what a capital stands over an x.
const PIECE = "relative top-[calc(0.5ex_-_0.5cap)] inline-flex max-w-full items-center align-middle whitespace-nowrap";
// A missing departure's word, where its field was: in the field's grey, at
// the field's size, a row's (TEXT.row: 16 at the least, 17 to a finger).
const ASKING = cn("px-1 font-sans normal-case text-muted-foreground", TEXT.row);

/**
 * One point of the route in the box, as a token of its TokenField, as
 * ForeFlight's route editor draws it (the owner's screenshot, 2026-11-23):
 * its arrival and approach before it, as they are flown into it ("I want
 * to show the approach pill before the corresponding airport pill"), its
 * pill, its departure after it, and the fuel stops suggested for the
 * flight that leaves it, dashed. No arrows: the order reads left to right,
 * and a point goes in before or after another from that one's menu
 * (RoutePill). The chips are not points of the route: not typed, a tap
 * opens the Procedures they were picked in. The first, with no departure,
 * carries the word for it, a tap asking for it.
 */
export default function RouteToken({ i, box }: { i: number; box: TokenBox }) {
  const { points, waypoints, hasDep, procedures, fuelStops } = box;
  const point = points[i];
  // A token the route has no point for: none drawn (the field and the
  // route are set together, so none is looked for).
  if (point === undefined) return null;
  const last = i === points.length - 1;
  const role = box.roleOf(i);
  // A field's chips once, at its first pill, when it is in the route twice.
  const first = i === points.indexOf(point);
  const procs = first ? procedures.filter((p) => sameField(p.ident, point)) : [];
  const waypoint = waypoints.has(point);
  const unknown = box.unknown === point;
  const stepped = (by: -1 | 1) => points.map((p, j) => (j === i ? points[i + by]! : j === i + by ? point : p));
  // The flight leaving this point's suggested stops, and whether it is short
  // with none offered, by both its ends (fuelStopsAt): a field departed from
  // twice has each flight's own.
  const flight = fuelStopsAt(points, waypoints, fuelStops)[i];
  const short = fuelStopsAt(points, waypoints, box.shortFlights)[i];
  const altitude = box.altitudeAt(point, waypoint);
  const cautions = [
    ...(altitude.caution ?? []),
    ...(short ? [short.onBoard ? `Too little fuel on board for ${short.name}` : `No fuel stop in reach on ${short.name}`] : []),
  ];
  const opener = (p: RouteProcedure) => (box.onProcedures ? () => box.onProcedures!(p) : undefined);
  // Its pieces in order, each `tight` to the one before it (a chip to its pill).
  const pieces: { key: string; tight: boolean; node: ReactNode }[] = [];
  if (i === 0 && !hasDep && !box.typedAtStart)
    pieces.push({
      key: "asking",
      tight: false,
      node: (
        // The departure asked for, its word a button as a field's
        // placeholder takes the tap that fills it; 44 tall by its area.
        <Button
          variant="ghost"
          size="xs"
          onClick={() => box.insertAt(0)}
          data-testid="route-ask-departure"
          aria-label="Add the departure"
          className="relative h-7 rounded-full px-0 hit-x-1 hit-y-2 hover:bg-transparent"
        >
          <span className={ASKING}>Departure</span>
        </Button>
      ),
    });
  procs
    .filter((p) => p.kind !== "departure")
    .sort((a, b) => (a.kind === "arrival" ? 0 : 1) - (b.kind === "arrival" ? 0 : 1))
    .forEach((p, n) =>
      pieces.push({ key: `${p.kind}-${p.label}`, tight: n > 0, node: <ProcedureChip procedure={p} onOpen={opener(p)} /> }),
    );
  pieces.push({
    key: "pill",
    tight: pieces.length > 0 && pieces[pieces.length - 1]!.key !== "asking",
    node: (
      <RoutePill
        ident={point}
        waypoint={waypoint}
        index={i}
        role={role}
        stopNumber={i + (hasDep ? 0 : 1)}
        altitude={altitude}
        unknown={unknown ? (box.unknownWhy ?? "Not an airport or waypoint we know.") : null}
        cautions={cautions}
        actions={{
          onInfo: box.onOpenAirport && identOf(point) ? () => box.onOpenAirport!(identOf(point)) : undefined,
          onInsertBefore: i > 0 && !box.full ? () => box.insertAt(i) : undefined,
          onInsertAfter: !box.full ? () => box.insertAt(i + 1) : undefined,
          onShowOnMap: box.onShowOnMap && !unknown ? () => box.onShowOnMap!(point) : undefined,
          onProcedures: box.onOpenProcedures ? (kind) => box.onOpenProcedures!(point, kind) : undefined,
          onChange: () => changePoint(box, i, role),
          // Flown to: a stop or the destination, not where it starts.
          direct: box.directTo !== null && sameField(box.directTo, point),
          onDirect:
            box.onDirectTo && i > 0 && hasDep
              ? () => box.onDirectTo!(box.directTo !== null && sameField(box.directTo, point) ? null : point)
              : undefined,
          onAltitude: () => box.editAltitude(point),
          // A place earlier or later: the two neighbours swapped, offered
          // only where each point may go there (placeAllowed).
          onMoveUp: i > 0 && box.canChange(stepped(-1)) ? () => box.change(stepped(-1)) : undefined,
          onMoveDown: !last && box.canChange(stepped(1)) ? () => box.change(stepped(1)) : undefined,
          onRemove: () => box.remove(i),
        }}
      />
    ),
  });
  procs
    .filter((p) => p.kind === "departure")
    .forEach((p) => pieces.push({ key: `${p.kind}-${p.label}`, tight: true, node: <ProcedureChip procedure={p} onOpen={opener(p)} /> }));
  // The fuel stops suggested for the flight that leaves this point, dashed
  // after it as the route goes on to them: one its ident, more folded into
  // one pill, "+3 fuel stops" (FuelStopFold; the owner, 2026-11-23: a box of
  // dashed pills). A tap puts them all in, there; each one from its menu.
  const idents = flight?.stops.map((s) => s.ident) ?? [];
  const keep = box.onKeepFuelStops;
  if (flight && idents.length)
    pieces.push({
      key: "fuel",
      tight: false,
      node:
        idents.length === 1 ? (
          <FuelStopChip
            ident={idents[0]!}
            reason={flight.reason}
            onAdd={keep ? () => keep(i, idents) : undefined}
            onHide={box.onHideFuelStop ? () => box.onHideFuelStop!(idents[0]!) : undefined}
          />
        ) : (
          <FuelStopFold
            idents={idents}
            reason={flight.reason}
            onAddAll={keep ? () => keep(i, idents) : undefined}
            onAdd={keep ? (ident) => keep(i, [ident]) : undefined}
            onHide={box.onHideFuelStop}
          />
        ),
    });
  return (
    // In the sheet's own type, not the field's monospace capitals, and its
    // own white space collapsed: the field keeps every space typed
    // (white-space: pre), which in a pill took 12 points beside its ident.
    // Inline, not one block: its pieces wrap as words do, each whole. A
    // <wbr> between two: two inline-flex boxes side by side with no space
    // between are one unbreakable run to WebKit (the owner's iPhone,
    // 2026-11-23). Each pill's and chip's 44-point area reaches half way
    // across the gap to its neighbour's.
    <span className="font-sans leading-normal whitespace-normal normal-case">
      {pieces.map((piece, n) => {
        // The gap after a piece, before the break: a wrapped line starts at
        // the box's left edge as the first does, where a gap before a piece
        // indented every line after the first.
        const next = pieces[n + 1];
        const gap = next ? (next.tight ? "me-1" : "me-2") : i < box.points.length - 1 ? "me-2" : undefined;
        return (
          <Fragment key={piece.key}>
            {(n > 0 || i > 0) && <wbr />}
            <span className={cn(PIECE, gap)}>{piece.node}</span>
          </Fragment>
        );
      })}
    </span>
  );
}

/** A point changed, by the one search asked for what goes in its place
 *  (Apple Maps' Change Stop, as FPL's timeline's Change: pointEnd), its
 *  ident in the field to start; a stop may be a fix, an end an airport or
 *  My Location, where the route is not at it already. */
function changePoint(box: TokenBox, i: number, role: "dep" | "stop" | "dest") {
  const { points } = box;
  const point = points[i]!;
  askSearchPick({
    label: `In place of ${pointName(point)}`,
    title: "Change Stop",
    query: isPosition(point) ? undefined : point,
    fixes: role === "stop",
    position: role !== "stop" && !isPosition(point) && !points.some(isPosition),
    onPick: (picked) => {
      if (!sameField(picked, point)) box.change(points.map((p, j) => (j === i ? (isPosition(picked) ? picked : picked.toUpperCase()) : p)));
    },
  });
}
