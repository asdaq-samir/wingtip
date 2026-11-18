import type { ComponentProps, ReactNode } from "react";
import { Keyboard, Plus } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { TEXT } from "../../lib/text";

// The rows of FPL's timeline that are an action rather than a point
// (TimelineRoute's card): Add a Stop, an end of the route still to pick,
// and the route typed or pasted. One look for all of them, a filled
// point's line (TimelineLine) drawn the same way: a 32-point circle in the
// marks' column, the words after the inset hairline, a 44-point row.

/** FPL's timeline's card, iOS's inset grouped list: never wider than the
 *  sheet, a row laid out past it clipped, not a sideways scroll of the
 *  panel (the iOS audit's rule). */
export const TIMELINE_CARD = "overflow-x-clip rounded-(--radius-banner) bg-card px-3";

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
 * marks' column, the route's magenta in short rounded dashes from under it
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
    <div className="relative">
      <Button
        variant="ghost"
        {...button}
        className={cn("h-11 w-full justify-start gap-3 px-0 font-normal hover:bg-transparent dark:hover:bg-transparent", TEXT.row)}
      >
        <span className="relative flex h-11 w-8 shrink-0 items-center justify-center">
          <span className="relative z-10">{mark}</span>
          {line && (
            <span
              aria-hidden="true"
              className="absolute top-10 -bottom-1 left-1/2 -translate-x-1/2 border-l-[3px] border-dotted border-course"
            />
          )}
        </span>
        <span
          className={cn(
            "flex h-full min-w-0 flex-1 items-center",
            !first && "border-t border-border",
            placeholder ? "text-muted-foreground" : "text-tint",
            trailing && "pr-12",
          )}
        >
          {children}
        </span>
      </Button>
      {trailing && <span className="absolute top-1/2 right-0 flex -translate-y-1/2 items-center">{trailing}</span>}
    </div>
  );
}

/** A stop before the destination, as Maps' Add Stop is, the last row of
 *  FPL's timeline on a whole route: its mark Apple Maps' -- a filled
 *  circle in the tint with a white + -- and its words in the tint. */
export function AddStopRow({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <TimelineAction
      mark={<RowMark filled glyph={<Plus className="size-4" strokeWidth={2.6} aria-hidden />} />}
      disabled={disabled}
      onClick={onClick}
      data-testid="timeline-add-stop"
    >
      Add a Stop
    </TimelineAction>
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
