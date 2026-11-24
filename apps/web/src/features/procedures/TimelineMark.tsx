import { Ellipsis, Fuel, Navigation, Triangle, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { colourOf } from "../../lib/map/marks/flightCategory";
import { pointName } from "../../lib/identSchema";
import { TEXT } from "../../lib/text";
import type { TimelinePoint } from "./lineModel";

/**
 * A point's mark, as Apple Maps' Directions draw theirs (the owner,
 * 2026-11-17: "give it similar look to Apple Maps for single rows"): a
 * filled 32-point circle with a white glyph -- My Location the tint with
 * the location arrow; an airport its flight category's colour (the map's,
 * grey with no report) with an airplane, a fuel stop's the pump; a
 * waypoint a grey triangle; one that cannot be flown to the red with ✕.
 * An airport's glyph is "•••", not an airplane: where the list edits the
 * route the mark is the point's menu (pointEnd's `menu`), and its dots say
 * so (the owner, 2026-11-20: "Stops should have ... buttons to show that
 * there are more options", "I meant replace the plane icon with three
 * dots"); its colour still the field's flight category. A hold on the
 * line stays the row's lift to move it (RouteGrid).
 *
 * The fills that change with the scheme are a filled button's (My
 * Location the --primary with its own --primary-foreground, as a picked
 * runway's chip is, GLASS_PICKED) or carry their glyph in the ground's
 * colour, as a badge's figure is (TabCount): at night the tint, the red
 * and the grey are light, and a white glyph on them read 2.5:1 and less,
 * under WCAG 1.4.11's 3:1 for a graphic (the HIG review, 2026-11-21:
 * Add a Stop's + on the night's tint, 2.49:1). A flight category's
 * colour is the same at night, its glyph white.
 */
export function TimelineMark({ point, position }: { point: TimelinePoint; position: boolean }) {
  const Glyph = point.problem ? X : position ? Navigation : !point.field ? Triangle : point.fuelStop ? Fuel : Ellipsis;
  return (
    <span
      className={cn(
        "grid size-8 place-items-center rounded-full",
        point.problem
          ? "bg-destructive text-background"
          : position
            ? "bg-primary text-primary-foreground"
            : !point.field || !point.category
              ? "bg-muted-foreground text-background"
              : "text-white",
      )}
      // The category's colour from the map's own scale (flightCategory). With
      // no report, the text's grey, as a waypoint's: on the map's own grey
      // (CATEGORY_UNKNOWN) the white "•••" read 2.6:1 by day and night.
      style={point.field && point.category && !point.problem && !position ? { backgroundColor: colourOf(point.category) } : undefined}
      data-testid={point.fuelStop ? "timeline-fuel" : undefined}
    >
      <Glyph className="size-4" strokeWidth={2.4} aria-label={point.fuelStop ? "fuel stop" : undefined} aria-hidden={!point.fuelStop} />
    </span>
  );
}

/**
 * A line's ident in the regular weight (the owner, 2026-11-20: "Stops font
 * can be non-bold"): a button where it does something -- `change` the
 * point where the list edits the route (pointEnd's, the one search with
 * its suggestions), else open the airport's card -- and words where not.
 */
export function LineIdent({
  point,
  change,
  onInfo,
  fuelSet,
}: {
  point: TimelinePoint;
  change: (() => void) | undefined;
  onInfo: () => void;
  /** The fuel's gauge after it is a control (FuelSet): their areas meet. */
  fuelSet: boolean;
}) {
  if (!change && !(point.field && !point.problem))
    return (
      <span className={cn("min-w-0 truncate font-normal", point.problem && "text-destructive", TEXT.row)} data-testid="timeline-ident">
        {pointName(point.ident)}
      </span>
    );
  return (
    <h3 className="relative z-10 flex min-w-0 shrink">
      {/* A tap on the name changes the point where the list edits
            the route (pointEnd's `change`, the one search with its
            suggestions); elsewhere it opens the airport's card. */}
      <Button
        variant="plain"
        size="inline"
        onClick={change ?? onInfo}
        aria-label={
          change
            ? `${pointName(point.ident)}${point.category ? `, ${point.category}` : ""}: change it`
            : `${point.ident}${point.category ? `, ${point.category}` : ""}: open the airport`
        }
        data-testid="timeline-ident"
        // The name cut short in a span of its own, not the
        // button: a button that clips (truncate's overflow) cut
        // its own 44-point area to its 22-point line (the iOS
        // audit's P1, "C81: change it" 25×22). Its area starts
        // 10 before the name, where the mark's ends (6 past the
        // marks' column, PointMenu's `bare`, in the line's 16),
        // and runs right to 44 wide at the least, over the fuel's
        // gauge after a short name where it is no control. Where
        // the gauge is one (FuelSet) the two meet in the middle of
        // the 18 between them, 9 past the name, so neither takes
        // the other's taps (the HIG review, 2026-11-21: the gauge
        // took 2-3 of "C81: change it"'s probes).
        className={cn(
          "relative min-w-0 font-normal hit-y-3 after:-left-2.5",
          fuelSet ? "after:w-[max(44px,calc(100%+19px))]" : "after:w-[max(54px,calc(100%+14px))]",
          // In the tint, as Add a Stop is: it is a tap (the owner,
          // 2026-11-24: "each stop should have same link style as add stop").
          point.problem ? "text-destructive" : "text-tint",
          TEXT.row,
        )}
      >
        <span className="min-w-0 truncate">{pointName(point.ident)}</span>
      </Button>
    </h3>
  );
}

/** What is said under a line, in place (lib/problems: no toast). */
export function LineNotes({ point, refused }: { point: TimelinePoint; refused: string | null }) {
  return (
    <>
      {/* A field it cannot land at, or a point the planner does not
          know: why, in red, always in sight (decision 0043). */}
      {point.problem && (
        <p className={cn("pb-2 text-destructive", TEXT.note)} data-testid="timeline-problem">
          {point.problem}
        </p>
      )}
      {/* A move of it the route cannot take, said where it was tried
          (lib/problems: in place, no toast); polite, as a screen
          reader's drop is said. */}
      <p role="status" className={cn("text-destructive empty:hidden", refused && "pb-2", TEXT.note)} data-testid="timeline-refusal">
        {refused}
      </p>
    </>
  );
}
