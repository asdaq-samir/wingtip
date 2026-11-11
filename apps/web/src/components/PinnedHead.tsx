import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Every card's and page's head in the sheet: ONE row -- its name, and its
 * Share, star and ✕ -- pinned at the sheet's top under the grabber from
 * the start, the content scrolling on under it seen blurred through its
 * frost (frost-head, index.css), at the owner's rule (2026-11-10: "just
 * keep the title on top and content moves under with a frosty style").
 * It replaced a large title that folded into a compact bar as the card
 * scrolled.
 *
 * Sticky in its scroller at the top, or under the sheet's head band where
 * that is over it in the same scroller (--sheet-head, SheetParts: the
 * search's row, a fixed height). Its frost reaches up over its scroller's
 * own room over the first line (--pinned-room, which the scroller sets: the
 * grabber's in a card), so it starts where it sticks. Its row is the round
 * buttons' height (RoundButton's size-9), so the whole of it is that room
 * and 3rem (PINNED_BELOW), where what pins under it sticks: an airport
 * card's tabs (PlaceCard). At the sheet's smallest size with
 * a card open it is all of the card in sight (data-sheet-head, SheetParts).
 * For the browser tests it is card-head-pinned; its row is the caller's
 * `testId`.
 */
export function PinnedHead({ children, testId, className }: { children: ReactNode; testId?: string; className?: string }) {
  return (
    <div className={PINNED_HEAD} data-sheet-head="" data-testid="card-head-pinned">
      <div className={cn("flex min-h-9 items-center gap-2", className)} data-testid={testId}>
        {children}
      </div>
    </div>
  );
}

/** The pinned head's own box, for a head drawn by hand where a wrapper
 *  would not do (ConsolePages' page head, which its stack hides by its slot). */
export const PINNED_HEAD =
  "frost-head sticky top-(--sheet-head,0px) z-20 -mx-4 -mt-(--pinned-room,0px) px-4 pt-[calc(var(--pinned-room,0px)+0.375rem)] pb-1.5 print:static";

/** Where what pins under a card's PinnedHead sticks, by plain CSS: the
 *  head's own top, its room over its row, and its 3rem (0.375rem, the
 *  36-point row, 0.375rem). */
export const PINNED_BELOW = "top-[calc(var(--sheet-head,0px)+var(--pinned-room,0px)+3rem)]";
