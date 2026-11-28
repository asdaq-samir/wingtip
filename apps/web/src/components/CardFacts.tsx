import type { ReactNode } from "react";
import { cn } from "cn";
import { TEXT } from "../lib/text";
import { Button } from "./ui/button";

/** One fact: its name small and grey over its value, as Maps' Hours,
 *  Yelp, Accepts and Distance are, and a `note` small and grey under it
 *  where it has one, at the caption's size. A long value (an owner's name)
 *  may be capped to a width with `className`, the whole of it in the
 *  card's Info. With `onPick` the value is in the tint and a tap on the
 *  fact opens what it sums up (the airport's Airspace, its hours), as
 *  Maps' Hours fact does, a 44-point area round it. */
export function CardFact({
  label,
  testId,
  className,
  note,
  onPick,
  shrink = false,
  children,
}: {
  label: string;
  testId: string;
  className?: string;
  note?: string | null;
  onPick?: () => void;
  /** The one fact that gives way in a row that never wraps (CardFacts'
   *  `oneRow`): only the room the others leave, its name cut short with
   *  an ellipsis and its value on two lines at the most. */
  shrink?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", shrink ? "min-w-0 shrink" : "shrink-0")} data-testid={testId}>
      <dt className={cn("text-muted-foreground", shrink && "truncate", TEXT.note)}>{label}</dt>
      <dd
        className={cn(
          "font-semibold text-foreground tabular-nums",
          shrink ? "line-clamp-2 break-words" : "whitespace-nowrap",
          TEXT.row,
          className,
        )}
      >
        {onPick ? (
          <Button
            variant="link"
            size="inline"
            className="relative font-semibold no-underline hit-x-2 hit-y-5"
            onClick={onPick}
            data-testid={`${testId}-open`}
          >
            {children}
          </Button>
        ) : (
          children
        )}
      </dd>
      {note && (
        <dd className={cn("whitespace-nowrap text-muted-foreground", TEXT.caption)} data-testid={`${testId}-note`}>
          {note}
        </dd>
      )}
    </div>
  );
}

/**
 * A card's facts in a row under its actions, a sideways scroller as Apple
 * Maps' place card's (the owner, 2026-11-14; C1 on the canvas
 * V1d9RDbmY1aczc4LfXed7a, "Airport card after Apple Maps"): the airport
 * card's (PlaceFacts) and the airplane cards' (AirplaneFacts, the owner
 * the same day: "make sure the airplane card looks similar to airport
 * card"). Each fact a CardFact, only where the card's data has it. With
 * `fit`, the airport card's five, spread across the card's width with no
 * sideways scroll (the owner, 2026-11-14: "keep the info strip compact
 * enough so pilot doesn't have to scroll"), the last of them wrapping to a
 * second row where larger text leaves no room. With `oneRow` as well, never
 * a second row (the airplane card's; the owner, 2026-11-27, a Weight
 * wrapped under "Airbus Helicopters"): the fact marked `shrink` gives way.
 */
export function CardFacts({ testId, fit, oneRow, children }: { testId: string; fit?: boolean; oneRow?: boolean; children: ReactNode }) {
  return (
    <dl
      // A sideways drag the row's, an up or down one the sheet's (rules.md, Sideways rows).
      data-base-ui-swipe-ignore={fit ? undefined : "x"}
      className={cn(
        "flex pt-4",
        fit
          ? cn("justify-between gap-x-2 gap-y-3", oneRow ? "flex-nowrap" : "flex-wrap")
          : "-mx-4 gap-6 overflow-x-auto overscroll-x-contain px-4",
      )}
      data-testid={testId}
    >
      {children}
    </dl>
  );
}

/** A card's terms and their values in two columns, the term small and
 *  grey at the left (the airspace card, a special-use area's, a
 *  checkpoint's leg). `className` sets the table's text, `ddClassName`
 *  the values'. */
export function TermTable({
  rows,
  testId,
  className,
  ddClassName,
}: {
  rows: readonly (readonly [string, ReactNode])[];
  testId?: string;
  className?: string;
  ddClassName?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-left", className)} data-testid={testId}>
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className={ddClassName}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
