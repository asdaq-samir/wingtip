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
export function PinnedHead({
  children,
  testId,
  className,
  slot,
  flush = false,
}: {
  children: ReactNode;
  testId?: string;
  className?: string;
  /** Its frame's slot, for a stack that hides a head under a page over it
   *  (ConsolePages' page-head, Settings' layer-head). */
  slot?: string;
  /** Its scroller has no sixteen-point sides of its own to reach out over
   *  (Settings' card, its pages padded each by its own): its room and its
   *  sides its own, the grabber's room over it as a card's. */
  flush?: boolean;
}) {
  return (
    <div className={flush ? PINNED_FLUSH : PINNED_HEAD} data-slot={slot} data-sheet-head="" data-testid="card-head-pinned">
      <div className={cn("flex min-h-9 items-center gap-2", className)} data-testid={testId}>
        {children}
      </div>
    </div>
  );
}

/** The pinned head's own box, out over its scroller's sixteen-point
 *  sides and the room over its first line. */
const PINNED_HEAD =
  "frost-head sticky top-(--sheet-head,0px) z-20 -mx-4 -mt-(--pinned-room,0px) px-4 pt-[calc(var(--pinned-room,0px)+0.375rem)] pb-1.5 print:static";

/** The same where nothing round it is padded: the grabber's room (a
 *  card's --pinned-room, SheetCard's) its own, so it sits as low as every
 *  card's head. */
const PINNED_FLUSH =
  "frost-head sticky top-(--sheet-head,0px) z-20 px-4 pt-[calc(var(--corner-inset,0.75rem)+0.375rem)] pb-1.5 print:static";

/** Where what pins under a card's PinnedHead sticks, by plain CSS: the
 *  head's own top, its room over its row, and its 3rem (0.375rem, the
 *  36-point row, 0.375rem). */
export const PINNED_BELOW = "top-[calc(var(--sheet-head,0px)+var(--pinned-room,0px)+3rem)]";
