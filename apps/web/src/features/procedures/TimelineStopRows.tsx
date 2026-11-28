import type { CSSProperties, ReactNode } from "react";
import { ChevronsUpDown, Fuel, Plus } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { TEXT } from "../../lib/text";
import { MAX_STOPS } from "../../lib/identSchema";
import { stopsNames, stopsTitle } from "./stopsRow";
import { RowMark, TimelineAction } from "./TimelineRows";

// The timeline's rows of a route with points (TimelineRoute) and the fuel
// stops' pill (FuelPill), apart from the empty route's (TimelineRows), so
// they load with the route's panel, not with the page (round 7's N14).

/**
 * The stops between the two ends as one row of the timeline below full
 * (the owner, 2026-11-18: "let's just show the stops as another row in
 * between"; listedPoints): the tint filled with the expand glyph in the
 * marks' column, "2 Stops" in the tint and their idents after it in grey,
 * cut short where they do not fit, the route's magenta on down to the
 * destination. A tap takes the sheet all the way up, where every stop is
 * its own row ("when the card is full, no need to show that because it
 * expands to show all the stops"), so the route never grows at half.
 */
export function StopsRow({ idents, onShowAll }: { idents: string[]; onShowAll: () => void }) {
  const { line, label } = stopsNames(idents);
  return (
    <TimelineAction
      mark={<RowMark filled glyph={<ChevronsUpDown className="size-4" strokeWidth={2.4} aria-hidden />} />}
      line
      onClick={onShowAll}
      aria-label={label}
      data-testid="timeline-stops"
    >
      <span className="shrink-0">{stopsTitle(idents.length)}</span>
      <span className="ml-2 min-w-0 truncate text-muted-foreground" data-testid="timeline-stops-idents">
        {line}
      </span>
    </TimelineAction>
  );
}

/** A stop before the destination, as Maps' Add Stop is, the last row of
 *  FPL's timeline on a whole route: its mark Apple Maps' -- a filled
 *  circle in the tint with a white + -- and its words in the tint. */
export function AddStopRow({ disabled, onClick, trailing }: { disabled: boolean; onClick: () => void; trailing?: ReactNode }) {
  return (
    <TimelineAction
      mark={<RowMark filled glyph={<Plus className="size-4" strokeWidth={2.6} aria-hidden />} />}
      disabled={disabled}
      onClick={onClick}
      trailing={trailing}
      data-testid="timeline-add-stop"
    >
      Add a Stop
      {/* Why it is greyed, said in it (the grouped box's audit, 2026-11-20). */}
      {disabled && <span className={cn("ml-2 truncate text-muted-foreground", TEXT.note)}>Up to {MAX_STOPS} stops</span>}
    </TimelineAction>
  );
}

/** The planner's fuel stops, a pill at Add a Stop's end (the owner,
 *  2026-11-20: "We should have a add fuel stops pill in the last row and
 *  when added, remove fuel stops pill"): "Add Fuel Stops" puts the first
 *  flight's suggested ones in, "Remove Fuel Stops" takes the fuel stops
 *  out again. The stock Button's chip, as the procedures' "+ APCH", in the
 *  tint's light wash to add and the stock destructive's light red to
 *  remove (the owner, 2026-11-20: "Adding fuel stops capsule should be
 *  light blue and removing should be light red"). */
export function FuelStopsChip({ added, onClick }: { added: boolean; onClick: () => void }) {
  return (
    <Button
      variant={added ? "destructive" : "tint"}
      size="chip"
      type="button"
      onClick={onClick}
      // The fuel glyph says "fuel", so the words are "Add Stops" and "Remove
      // Stops" and the row stays one line at the owner's 19.65-px text on a
      // 375- or 393-point iPhone (the owner, 2026-11-22: "Remove fuel stops
      // goes to the next line"; "So icon with add/remove stops"); said in
      // full to a screen reader, its name starting with the words seen
      // (WCAG 2.5.3, Label in Name: axe's label-content-name-mismatch).
      aria-label={added ? "Remove Stops for fuel" : "Add Stops for fuel"}
      data-testid="timeline-fuel-stops"
      style={CHIP_44}
      data-look={added ? "remove" : "add"}
      // The stock chip's own size, its words and padding, at the owner's
      // ask (2026-11-25: "Add fuel stops pill can be standard size?"),
      // where it was a note's size and 4 a side to keep Add a Stop's row
      // one line at the owner's 19.65 px; its area 44 (CHIP_44, hit-1.5).
      className="shrink-0"
    >
      <Fuel className="size-4" aria-hidden="true" />
      {added ? "Remove Stops" : "Add Stops"}
    </Button>
  );
}

/** Where a flight is short of fuel and the planner offers no stop on it,
 *  why, at Add a Stop's end where the fuel stops' pill would be (warn,
 *  never limit; the aviation audit of 2026-11-21, F7.6): the fuel on board
 *  at the start already under its start, taxi and reserve (14 CFR
 *  91.151(a), 91.167(a)), or no field with fuel in the tanks' reach. The
 *  first such flight, named by its two ends. */
export function NoFuelStopNote({ flight }: { flight: { name: string; onBoard: boolean } }) {
  return (
    <span className={cn("truncate text-destructive-ink", TEXT.note)} data-testid="timeline-no-fuel-stop">
      {flight.onBoard ? `Too little fuel on board for ${flight.name}` : `No fuel stop in reach on ${flight.name}`}
    </span>
  );
}

/** The row's chips' areas 44 tall whatever their own height (30 at the
 *  default text, where the chip's hit-1.5 made 42): the area's reach over
 *  and under the chip, as a pseudo-element, so nothing that is seen grows. */
const CHIP_44 = { "--hit-y": "calc((100% - 44px) / 2)" } as CSSProperties;
