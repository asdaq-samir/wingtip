import { useContext, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import type { PillHead } from "../../openCards";
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
  media,
  pill,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** The thing's own mark before its title -- a checkpoint's numbered
   *  dot, a waypoint's diamond, a TFR's badge -- the head then set to its
   *  left, as a list's rows are: the cards on the map read as the
   *  panel's do, at the pilot's ask for every card to read as Nearest's. */
  media?: ReactNode;
  /** What the pill shows of it on a phone, as an airport's card's head
   *  drawn small (PillPicture): its name, one line, and its colour on the
   *  chart behind them, at the owner's ask (2026-10-29). */
  pill?: PillHead;
  children?: ReactNode;
}) {
  // Its mark and its name in the sheet card's head (SheetCardHead), at a
  // card's size where its close is, and the rest the card's body, the
  // panel's width.
  const inSheet = useContext(SheetCardHead);
  // Given by its strings, not the object, made new at each draw.
  const setPill = inSheet?.setPill;
  const name = pill?.name,
    line = pill?.line,
    colour = pill?.colour;
  useEffect(() => {
    if (!setPill || !name) return;
    setPill({ name, line, colour });
    return () => setPill(undefined);
  }, [setPill, name, line, colour]);
  return (
    <>
      {inSheet?.slot &&
        createPortal(
          <>
            {media}
            <div className="min-w-0 flex-1">
              <h2
                id={inSheet.headingId}
                tabIndex={-1}
                className={cn(
                  "flex items-center gap-x-2 font-bold tracking-tight text-foreground outline-none",
                  cn("flex-wrap", TEXT.card),
                )}
              >
                {title}
              </h2>
              {subtitle !== undefined && <p className={cn("text-muted-foreground", TEXT.detail)}>{subtitle}</p>}
            </div>
          </>,
          inSheet.slot,
        )}
      <div className={cn("space-y-3", TEXT.detail)}>{children}</div>
    </>
  );
}
