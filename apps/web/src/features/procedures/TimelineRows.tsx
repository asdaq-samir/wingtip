import type { ComponentProps, ReactNode, CSSProperties } from "react";
import { ChevronsUpDown, FileUp, Fuel, Keyboard, Plus } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { TEXT } from "../../lib/text";
import { MAX_STOPS } from "../../lib/identSchema";
import { stopsNames, stopsTitle } from "./stopsRow";
import { chipLook } from "./chipLook";

/** The route's magenta, one solid line from under a line's mark into the
 *  next line, centred under the marks (TimelineLine's and the rows here);
 *  solid where it was dotted, at the owner's word (2026-11-19: "Replace
 *  doted magenta with solid on timeline"), as the route's line on the map. */
export const TIMELINE_THREAD = "absolute top-10 -bottom-1 left-1/2 -translate-x-1/2 border-l-[3px] border-solid border-course";

// The rows of FPL's timeline that are an action rather than a point
// (TimelineRoute's card): the stops below full, Add a Stop, an end of the
// route still to pick, and the route typed or pasted. One look for all of them, a filled
// point's line (TimelineLine) drawn the same way: a 32-point circle in the
// marks' column, the words after the inset hairline, a 44-point row.

/** FPL's timeline's card, iOS's inset grouped list: never wider than the
 *  sheet, a row laid out past it clipped, not a sideways scroll of the
 *  panel (the iOS audit's rule). The app's grouped lists' box
 *  (GroupedList's GROUP: the card's corner, its edge) and 16 points in at
 *  the leading side, none at the trailing, so a row's hairline runs to the
 *  card's edge as iOS's does; each row keeps its own 16 there (the grouped
 *  box's audit, 2026-11-20). */
export const TIMELINE_CARD = "overflow-x-clip rounded-(--radius-card) border border-border bg-card pl-4";
/** A row's words' room at the trailing side, inside its hairline. */
export const TIMELINE_END = "pr-4";
/** The marks' column to the words, 16: a point's mark's area runs 6 past
 *  its 32 and a name's from 10 before it (PointMenu's `bare`,
 *  TimelineLine's ident), so a three-letter name's 44-point square, centred
 *  on it, ends where the mark's begins (the iOS audit's P1; at 12 the two
 *  crossed). */
export const TIMELINE_GAP = "gap-4";

/** The circle in the marks' column: the tint's wash with the tint's glyph,
 *  as a point's "•••" (TimelineMark), or filled with a white glyph, as
 *  Apple Maps' Add Stop: a filled button's --primary and its own
 *  foreground, as a picked runway's chip is (GLASS_PICKED), the same as the
 *  tint by day; at night the tint is a light blue a white + read 2.49:1 on
 *  (the HIG review, 2026-11-21; WCAG 1.4.11 asks 3:1). */
function RowMark({ glyph, filled }: { glyph: ReactNode; filled: boolean }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full",
        filled ? "bg-primary text-primary-foreground" : "bg-tint/12 text-tint",
      )}
    >
      {glyph}
    </span>
  );
}

/**
 * A row of the timeline that does one thing at a tap: the stock Button a
 * whole row wide and 44 points tall (the audit's WEB-18), its mark in the
 * marks' column, the route's magenta, one solid line, from under it
 * into the next row where one follows (`line`), as a point's line draws
 * it, and its words after the hairline (none on the card's first row).
 * `trailing`, controls of their own at the row's end, after the words on
 * the row's line where both fit and on a 44-point line of their own under
 * them, at the row's end, where they do not: held over the words at a
 * fixed room, Add a Stop's keyboard and Add Fuel Stops wrote over "Add a
 * Stop" at the owner's 19.65 px (the HIG review, 2026-11-21: "Add a
 * [keyboard]top"). The hairline is the row's then, from the words' start
 * to the card's edge, over both.
 */
function TimelineAction({
  mark,
  children,
  line = false,
  first = false,
  placeholder = false,
  trailing,
  ...button
}: Omit<ComponentProps<typeof Button>, "children"> & {
  mark: ReactNode;
  children: ReactNode;
  line?: boolean;
  first?: boolean;
  /** Its words a field's placeholder's grey, not the tint. */
  placeholder?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-wrap items-center",
        // The hairline from the words' start (the marks' 2 rem and the
        // 1 rem between, TIMELINE_GAP) to the card's edge.
        trailing && !first && "before:absolute before:inset-x-0 before:top-0 before:left-12 before:border-t before:border-border",
      )}
    >
      <Button
        variant="ghost"
        {...button}
        // Greyed under a finger as iOS's rows are (the grouped box's audit).
        // As wide as its words at the least, the controls after it going
        // under it where the two do not fit on one line.
        className={cn(
          // With controls after it, as wide as its words alone, so Add a
          // Stop, the fuel stops' pill and the route's toggle share its
          // line on a 375-point iPhone (the owner, 2026-11-22: "can you
          // adjust the spacing so they fit in the same line as add a stop?").
          trailing ? "flex-none" : "flex-auto",
          "h-11 justify-start rounded-none px-0 font-normal hover:bg-transparent pointer-coarse:active:bg-muted pointer-coarse:active:opacity-100 dark:hover:bg-transparent",
          TIMELINE_GAP,
          TEXT.row,
        )}
      >
        <span className="relative flex h-11 w-8 shrink-0 items-center justify-center">
          <span className="relative z-10">{mark}</span>
          {line && <span aria-hidden="true" className={TIMELINE_THREAD} />}
        </span>
        <span
          className={cn(
            "flex h-full min-w-0 flex-1 items-center",
            !first && !trailing && "border-t border-border",
            placeholder ? "text-muted-foreground" : "text-tint",
            trailing ? "pr-0" : TIMELINE_END,
          )}
        >
          {children}
        </span>
      </Button>
      {/* 8 points between its 32-point chips, the rows' gap-2, their 44-point
          areas (hit-1.5, 6 out each side) meeting over it; 8 in from the
          card's edge, the toggle last, at the box's bottom right (the owner,
          2026-11-22: "the route box toggle should be pinned to the bottom right"). */}
      {trailing && <span className="ml-auto flex h-11 items-center gap-0.5">{trailing}</span>}
    </div>
  );
}

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
 *  out again. The procedures' "+ APCH" chip's shape (chipLook), in the
 *  tint's light wash to add and the stock destructive's light red to
 *  remove (the owner, 2026-11-20: "Adding fuel stops capsule should be
 *  light blue and removing should be light red"). */
export function FuelStopsChip({ added, onClick }: { added: boolean; onClick: () => void }) {
  return (
    <Button
      variant={added ? "destructive" : "ghost"}
      type="button"
      onClick={onClick}
      // The fuel glyph says "fuel", so the words are "Add Stops" and "Remove
      // Stops" and the row stays one line at the owner's 19.65-px text on a
      // 375- or 393-point iPhone (the owner, 2026-11-22: "Remove fuel stops
      // goes to the next line"; "So icon with add/remove stops"); said in
      // full to a screen reader.
      aria-label={added ? "Remove fuel stops" : "Add fuel stops"}
      data-testid="timeline-fuel-stops"
      style={CHIP_44}
      data-look={added ? "remove" : "add"}
      className={cn(chipLook(true), ROW_CHIP, !added && "bg-tint/12 hover:bg-tint/20! dark:hover:bg-tint/20!")}
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
 *  default text, where chipLook's hit-1.5 made 42): the area's reach over
 *  and under the chip, as a pseudo-element, so nothing that is seen grows. */
const CHIP_44 = { "--hit-y": "calc((100% - 44px) / 2)" } as CSSProperties;

/** The last row's two chips, closer and in a note's size, so Add a Stop, the
 *  fuel stops' pill and the route's toggle are one line at the owner's
 *  19.65-px text on a 375- or 393-point iPhone (measured: "Remove Stops"
 *  wrapped by 27 points at 393, 15 at 375): their areas stay 44 (CHIP_44,
 *  hit-1.5), overlapping where the chips are closer than 12. */
const ROW_CHIP = cn("gap-0.5 px-1 font-medium", TEXT.note);

/** Type the Route on a whole route, at the grouped box's bottom right, after Add
 *  a Stop and the fuel stops' pill: a toggle between the two faces of the same box, the
 *  timeline and the route's field (RouteEditor) to type or paste the route
 *  in whole, with no row or Done of its own (the owner, 2026-11-22: "It
 *  should make the same grouped box into route box and the other way. No
 *  need for a separate row and done etc."). The keyboard glyph alone in the
 *  fuel stops' chip's shape, its wash, and its 44-point area (chipLook),
 *  pressed (aria-pressed, the tint filled) while the field is the face. */
export function TypeRouteButton({ pressed, onToggle }: { pressed: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={onToggle}
      aria-label="Type the route"
      aria-pressed={pressed}
      data-testid="route-type-open"
      // 44 across as well, the glyph's chip 27 wide at its tightest.
      style={{ ...CHIP_44, "--hit-x": "calc((100% - 44px) / 2)" } as CSSProperties}
      className={cn(
        chipLook(true),
        ROW_CHIP,
        // The glyph alone, its room round it the least of the row's.
        "px-0.5",
        pressed ? "bg-tint text-primary-foreground hover:bg-tint/90!" : "bg-tint/12 hover:bg-tint/20! dark:hover:bg-tint/20!",
      )}
    >
      <Keyboard className="size-4" aria-hidden="true" />
    </Button>
  );
}

/**
 * An end of the route not yet picked, in its place on the timeline (the
 * owner, 2026-11-18: "the empty fpl page looks a bit different than filled
 * one"): its role in a placeholder's grey where a point's ident is, and a
 * + on the tint's wash where a point's "•••" is; a tap asks the one search
 * for it, as a point's Change does.
 */
export function EndRow({
  end,
  onPick,
  line = false,
  first = false,
}: {
  end: "Departure" | "Destination";
  onPick: () => void;
  line?: boolean;
  first?: boolean;
}) {
  return (
    <TimelineAction
      mark={<RowMark filled={false} glyph={<Plus className="size-5" strokeWidth={2.4} aria-hidden />} />}
      placeholder
      line={line}
      first={first}
      onClick={onPick}
      aria-label={`Pick the ${end.toLowerCase()}`}
      data-testid={end === "Departure" ? "timeline-pick-dep" : "timeline-pick-dest"}
    >
      {end}
    </TimelineAction>
  );
}

/** The route typed or pasted whole, the last row of the timeline before
 *  the route is whole, where Add a Stop is after: a tap opens the route's
 *  field (RouteBox), as the keyboard button at Add a Stop's end does on a
 *  whole route (TypeRouteButton), with its glyph. `trailing`, the field's own ✕ or Undo while it
 *  is folded away. */
export function TypeRouteRow({ onType, trailing }: { onType: () => void; trailing?: ReactNode }) {
  return (
    <TimelineAction
      mark={<RowMark filled glyph={<Keyboard className="size-4" strokeWidth={2.4} aria-hidden />} />}
      onClick={onType}
      trailing={trailing}
      data-testid="timeline-type-route"
    >
      Type or Paste a Route
    </TimelineAction>
  );
}

/** A route file opened, under Type or Paste a Route: the device's file
 *  picker for a flight plan's .fpl or a GPX route (RouteStart's), which
 *  is previewed before it is used, as a shared flight is. */
export function OpenRouteFileRow({ onOpen }: { onOpen: () => void }) {
  return (
    <TimelineAction
      mark={<RowMark filled glyph={<FileUp className="size-4" strokeWidth={2.4} aria-hidden />} />}
      onClick={onOpen}
      data-testid="timeline-open-route-file"
    >
      Open a Route File
    </TimelineAction>
  );
}
