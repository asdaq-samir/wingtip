import type { ReactNode } from "react";
import { cn } from "cn";
import { TEXT } from "../lib/text";

/** One fact: its name small and grey over its value, as Maps' Hours,
 *  Yelp, Accepts and Distance are. A long value (an owner's name) may be
 *  capped to a width with `className`, the whole of it in the card's Info. */
export function CardFact({
  label,
  testId,
  className,
  children,
}: {
  label: string;
  testId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5" data-testid={testId}>
      <dt className={cn("text-muted-foreground", TEXT.note)}>{label}</dt>
      <dd className={cn("font-semibold whitespace-nowrap text-foreground tabular-nums", TEXT.row, className)}>{children}</dd>
    </div>
  );
}

/**
 * A card's facts in a row under its actions, a sideways scroller as Apple
 * Maps' place card's (the owner, 2026-11-14; C1 on the canvas
 * V1d9RDbmY1aczc4LfXed7a, "Airport card after Apple Maps"): the airport
 * card's (PlaceFacts) and the airplane cards' (AirplaneFacts, the owner
 * the same day: "make sure the airplane card looks similar to airport
 * card"). Each fact a CardFact, only where the card's data has it.
 */
export function CardFacts({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <dl
      // A sideways drag the row's, an up or down one the sheet's (rules.md, Sideways rows).
      data-base-ui-swipe-ignore="x"
      className="-mx-4 flex gap-6 overflow-x-auto overscroll-x-contain px-4 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid={testId}
    >
      {children}
    </dl>
  );
}
