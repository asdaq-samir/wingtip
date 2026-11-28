import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { SheetCardHead } from "../../sheetCards";
import { TEXT } from "../../text";

/**
 * What every card on either map is made of: what the thing is, where it
 * is, and whatever that particular card can do about it.
 *
 * Measured before this existed, across the three cards a pilot can
 * open: two different close buttons and three sizes of corner control
 * (32, 36 and 40). Each was reasonable where it was written and none of
 * them agreed. Now every one is a card in the map's panel (SheetCard,
 * which the map's openCard and the training map both open), as Maps
 * opens a place's card in its one sheet, with the panel's close as every
 * card's. Its words at a list's sizes (TEXT): to a finger the title 17
 * points and the rest 15, where they were 14 and 12.
 *
 * A tap on the chart puts a card away (GlMapShell), which is what every
 * map does, so the tap that opened a card and the tap that puts it away
 * are both halves of one gesture.
 */
export function MapCard({
  title,
  subtitle,
  start,
  children,
}: {
  /** The thing's ident or name ("KMSN", "OBK", "4/1234"), and under it
   *  what it is and its details ("VORTAC · 113.0"): one rule for every
   *  card (the owner, 2026-11-18), as Apple Maps writes a place's name and
   *  a short line. No mark before the name: the head has no place for one
   *  (the owner's iPhone, 2026-11-14). */
  title: ReactNode;
  subtitle?: ReactNode;
  /** At the head row's start, where every card has it: its Share
   *  (CardHead's CardShareButton), the name then centred between it and
   *  the close (the card rule's 8). */
  start?: ReactNode;
  children?: ReactNode;
}) {
  // Its name in the sheet card's head (SheetCardHead), at a card's size
  // where its close is, and the rest the card's body, the panel's width.
  const inSheet = useContext(SheetCardHead);
  return (
    <>
      {inSheet?.slot &&
        createPortal(
          <div className="min-w-0 flex-1">
            <h2
              id={inSheet.headingId}
              tabIndex={-1}
              // Centred, as the line under it is and as every card's name is
              // (CardHeadRow): left-set, it sat off the line's centre (the
              // owner's iPhone, 2026-11-14, a TFR's card). One line each,
              // cut short, at CardHeadRow's sizes (the card's name, a note's
              // 13 under it), so every card's head is the same height at the
              // pill (these were 15 and
              // wrapped).
              className={cn("truncate text-center font-bold text-foreground outline-none", TEXT.card)}
            >
              {title}
            </h2>
            {subtitle !== undefined && subtitle !== "" && (
              <p className={cn("truncate text-center text-muted-foreground tabular-nums", TEXT.note)} data-testid="card-sub">
                {subtitle}
              </p>
            )}
          </div>,
          inSheet.slot,
        )}
      {inSheet?.startSlot && start && createPortal(start, inSheet.startSlot)}
      <div className={cn("space-y-3", TEXT.detail)}>{children}</div>
    </>
  );
}
