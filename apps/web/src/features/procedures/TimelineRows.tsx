import type { ComponentProps, ReactNode } from "react";
import { Keyboard, Plus } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Toggle } from "../../components/ui/toggle";
import { TEXT } from "../../lib/text";

/** The route's magenta, one solid line from under a line's mark into the
 *  next line, centred under the marks (TimelineLine's and the rows here);
 *  solid where it was dotted, at the owner's word (2026-11-19: "Replace
 *  doted magenta with solid on timeline"), as the route's line on the map. */
export const TIMELINE_THREAD = "absolute top-10 -bottom-3 left-1/2 -translate-x-1/2 border-l-[3px] border-solid border-course";

// The rows of FPL's timeline that are an action rather than a point
// (TimelineRoute's card): the stops below full, Add a Stop, an end of the
// route still to pick, and the route typed or pasted; the first two, and
// the fuel stops' pill, in TimelineStopRows, off the first load, which
// draws only the empty route's (RouteStart). One look for all of them, a filled
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
export function RowMark({ glyph, filled }: { glyph: ReactNode; filled: boolean }) {
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
export function TimelineAction({
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
        // Greyed under a finger as iOS's rows are (the grouped box's audit),
        // and under a mouse's press too, a lighter grey as it points (hover
        // is a fine pointer's alone, index.css).
        // As wide as its words at the least, the controls after it going
        // under it where the two do not fit on one line.
        className={cn(
          // With controls after it, as wide as its words alone, so Add a
          // Stop, the fuel stops' pill and the route's toggle share its
          // line on a 375-point iPhone (the owner, 2026-11-22: "can you
          // adjust the spacing so they fit in the same line as add a stop?").
          trailing ? "flex-none" : "flex-auto",
          "h-11 justify-start rounded-none px-0 font-normal hover:bg-muted/50 active:bg-muted pointer-coarse:active:opacity-100 dark:hover:bg-muted/50",
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
      {/* Where they don't all fit on the words' line they go under it
          (flex-wrap), never past the card's edge, which clips them (the
          owner's iPhone, 2026-11-22: the toggle cut off, the two chips'
          areas crossing at 2 apart). */}
      {/* As far in from the card's right edge as its words are from its
          left (the card's pl-4; the owner's iPhone, 2026-11-23: the toggle
          touched the box's edge). */}
      {trailing && <span className={cn("ml-auto flex h-11 items-center gap-2", TIMELINE_END)}>{trailing}</span>}
    </div>
  );
}

/** Type the Route, at the box's own bottom right on every face, in its
 *  last row (Add a Stop's, the empty route's Destination, half a route's
 *  last) and over the route's field's last line, pressed there: a
 *  toggle between the two faces of the same box, the timeline and the
 *  route's field (RouteEditor) to type or paste the route in whole, with
 *  no row or Done of its own (the owner, 2026-11-22: "It should make the
 *  same grouped box into route box and the other way. No need for a
 *  separate row and done etc."; 2026-11-23: "the toggle is enough", and
 *  "doesn't look standard"). The stock Toggle in its tint variant: the
 *  keyboard glyph in the tint on its wash in a circle the head's round
 *  chip's size (32), filled in the tint while the field is the face (the
 *  owner, 2026-11-23: "is the toggle standard?"); its 44-point area a
 *  pseudo-element, so it grows not. */
export function TypeRouteButton({ pressed, onToggle }: { pressed: boolean; onToggle: () => void }) {
  return (
    <Toggle
      variant="tint"
      size="round"
      pressed={pressed}
      onPressedChange={onToggle}
      aria-label="Type the route"
      data-testid="route-type-open"
      // Its area 44 whatever the circle's size, a pseudo-element.
      className="relative hit-1.5"
    >
      <Keyboard aria-hidden="true" />
    </Toggle>
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
  trailing,
}: {
  end: "Departure" | "Destination";
  onPick: () => void;
  line?: boolean;
  first?: boolean;
  /** At the row's end: the box's toggle, where this is the card's last row. */
  trailing?: ReactNode;
}) {
  return (
    <TimelineAction
      mark={<RowMark filled={false} glyph={<Plus className="size-5" strokeWidth={2.4} aria-hidden />} />}
      placeholder
      line={line}
      first={first}
      trailing={trailing}
      onClick={onPick}
      aria-label={`Pick the ${end.toLowerCase()}`}
      data-testid={end === "Departure" ? "timeline-pick-dep" : "timeline-pick-dest"}
    >
      {end}
    </TimelineAction>
  );
}
