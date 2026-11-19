import type { ReactNode } from "react";
import { cn } from "cn";
import { ROUTE_LINE } from "./routeListStyle";

/**
 * The course's line through the cards, from each card's mark to the
 * next's, at the owner's asks (2026-11-05: "magenta connecting line can go
 * through the card to airport icons"; then, the line tried outside the
 * cards with a stub into each mark, "I don't like the connections from the
 * left, can we squeeze the capsule space and maybe slide them to the right
 * so we have non overlapping space for connections on the left of
 * runways"): down the marks' column, behind all the card holds (the card
 * isolated, the line under its content), and across the gap to the next
 * card. The first card's starts, and the last's ends, under its mark, on
 * a disc of the card's fill (CardMark), as the mark's grey is see-through.
 */
export function CardThread({ first, last }: { first: boolean; last: boolean }) {
  if (first && last) return null;
  // An airport's card in the route's list (FIELD_CARD): its column 6 in and
  // its mark 8 down, the gap under it FIELD_GAP's 12.
  const place = cn("left-[calc(1.25rem-1px)]", first ? "top-6" : "top-0", last ? "h-6" : "-bottom-3");
  return <span aria-hidden="true" style={ROUTE_LINE} className={cn("absolute -z-10 w-0.5", place)} />;
}

/** A card's mark on a disc of the card's own colour -- the sheet under the
 *  card's fill -- hiding the line under it, as the mark's grey is
 *  see-through. */
export const CardMark = ({ children }: { children: ReactNode }) => (
  <span className="grid place-items-center rounded-full bg-(--sheet)">
    <span className="grid place-items-center rounded-full bg-foreground/8">{children}</span>
  </span>
);
