import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CARD_FOOT, putCardFoot, useCardFeet, useCardFootSlot } from "./cardFeet";
import { observeHeight } from "./footBarHeight";

/**
 * A card's foot on a phone's bottom sheet: a slot standing still at the
 * screen's foot, outside every sliding popup -- a sibling of the sheet's
 * popup in its viewport (SheetDrawer), as FPL's foot bar is (sheet/FootBar)
 * -- where the card's floating tab bar is put (CardTabBar), so the card
 * slides behind it and nothing in it follows the card: anything that stays
 * still at the foot lives outside the sliding panel, never counter-moved
 * inside it.
 *
 * In sight (`shown`) while its card is the top one and open, through its
 * drags and slides (CardStack), and out of sight once the card rests at
 * the pill; it fades in, opacity alone, as it comes, and goes at once.
 * Its height, measured as it resizes (the ResizeObserver's first report
 * the first), is told (cardFeet's useCardFootHeight) for the card's end
 * room and scroll padding, and kept while it is out of sight, so the
 * card's end room keeps the bar's height from one opening to the next.
 */
export function CardFootSlot({ id, shown }: { id: string; shown: boolean }) {
  const host = useCardFeet((s) => s.host);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const kept = () => useCardFeet.getState().feet[id]?.height ?? 0;
    putCardFoot(id, { el, shown, height: kept() });
    if (!shown) return;
    return observeHeight(el, (height) => {
      if (kept() !== height) putCardFoot(id, { el, shown, height });
    });
  }, [el, id, shown]);
  useLayoutEffect(() => (el ? () => putCardFoot(id, null) : undefined), [el, id]);
  if (!host) return null;
  return createPortal(
    <div
      ref={setEl}
      {...{ [CARD_FOOT]: id }}
      hidden={!shown}
      // Its own ground takes no touch: only the bar's capsule does. In by
      // a short fade from its first style (@starting-style) as it is
      // shown, out at once (display: none), as a card's controls give way.
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 transition-opacity duration-(--motion-fade) ease-(--motion-sheet-ease) starting:opacity-0 print:hidden"
    />,
    host,
  );
}

/** What a card's foot slot holds: put in the slot where its card has one,
 *  nothing while the slot is out of sight, else `inline` in the card. A
 *  portal, so it keeps the providers it is drawn in (the card's Tabs). */
export function InCardFoot({ children, inline }: { children: ReactNode; inline: ReactNode }) {
  const slot = useCardFootSlot();
  if (slot === undefined) return inline;
  return slot ? createPortal(children, slot) : null;
}
