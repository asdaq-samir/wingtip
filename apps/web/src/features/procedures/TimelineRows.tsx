import type { ComponentProps, ReactNode } from "react";
import { ChevronsUpDown, Fuel, Keyboard, Plus } from "lucide-react";
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

/** The circle in the marks' column: the tint's wash with the tint's glyph,
 *  as a point's "•••" (TimelineMark), or filled in the tint with a white
 *  glyph, as Apple Maps' Add Stop. */
function RowMark({ glyph, filled }: { glyph: ReactNode; filled: boolean }) {
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", filled ? "bg-tint text-white" : "bg-tint/12 text-tint")}>
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
 * `trailing`, a control of its own at the row's end, over the hairline.
 */
function TimelineAction({
  mark,
  children,
  line = false,
  first = false,
  placeholder = false,
  trailing,
  room = "pr-16",
  ...button
}: Omit<ComponentProps<typeof Button>, "children"> & {
  mark: ReactNode;
  children: ReactNode;
  line?: boolean;
  first?: boolean;
  /** Its words a field's placeholder's grey, not the tint. */
  placeholder?: boolean;
  trailing?: ReactNode;
  /** The words' room kept clear of `trailing`, its width. */
  room?: string;
}) {
  return (
    <div className="relative">
      <Button
        variant="ghost"
        {...button}
        // Greyed under a finger as iOS's rows are (the grouped box's audit).
        className={cn(
          "h-11 w-full justify-start gap-3 rounded-none px-0 font-normal hover:bg-transparent pointer-coarse:active:bg-muted pointer-coarse:active:opacity-100 dark:hover:bg-transparent",
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
            !first && "border-t border-border",
            placeholder ? "text-muted-foreground" : "text-tint",
            trailing ? room : TIMELINE_END,
          )}
        >
          {children}
        </span>
      </Button>
      {trailing && <span className="absolute top-1/2 right-4 flex -translate-y-1/2 items-center">{trailing}</span>}
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
      room="pr-52"
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
      data-testid="timeline-fuel-stops"
      data-look={added ? "remove" : "add"}
      className={cn(chipLook(true), !added && "bg-tint/12 hover:bg-tint/20! dark:hover:bg-tint/20!")}
    >
      <Fuel className="mr-1 size-4" aria-hidden="true" />
      {added ? "Remove Fuel Stops" : "Add Fuel Stops"}
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
 *  field (RouteBox), as More's Type the Route does on a whole route, with
 *  More's keyboard glyph. `trailing`, the field's own ✕ or Undo while it
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
