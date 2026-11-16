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
  children,
}: {
  label: string;
  testId: string;
  className?: string;
  note?: string | null;
  onPick?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5" data-testid={testId}>
      <dt className={cn("text-muted-foreground", TEXT.note)}>{label}</dt>
      <dd className={cn("font-semibold whitespace-nowrap text-foreground tabular-nums", TEXT.row, className)}>
        {onPick ? (
          <Button
            variant="link"
            size="inline"
            className="relative font-semibold no-underline after:absolute after:-inset-x-2 after:-inset-y-5"
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
 * enough so pilot doesn't have to scroll").
 */
export function CardFacts({ testId, fit, children }: { testId: string; fit?: boolean; children: ReactNode }) {
  return (
    <dl
      // A sideways drag the row's, an up or down one the sheet's (rules.md, Sideways rows).
      data-base-ui-swipe-ignore={fit ? undefined : "x"}
      className={cn(
        "flex pt-4",
        fit
          ? "justify-between gap-2"
          : "-mx-4 gap-6 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
      data-testid={testId}
    >
      {children}
    </dl>
  );
}
