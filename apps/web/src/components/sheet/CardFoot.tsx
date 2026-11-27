import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CARD_FOOT, putCardFoot, useCardFeet, useCardFootSlot } from "./cardFeet";

/**
 * A card's foot on a phone's bottom sheet: a slot standing still at the
 * screen's foot, outside every sliding popup -- a sibling of the sheet's
 * popup in its viewport (SheetDrawer), as FPL's foot bar is (sheet/FootBar)
 * -- where the card's floating tab bar is put (CardTabBar), so the card
 * slides behind it and nothing in it follows the card (the sheet-motion
 * audit of 2026-11-23: anything that stays still at the foot lives outside
 * the sliding panel, never counter-moved inside it). Where the bar stood
 * in the card's popup, held at the screen's foot by the Drawer's offset
 * and the finger's movement on the Drawer's curve, it could slide apart
 * from the card on the iPhone mid-drag.
 *
 * In sight (`shown`) while its card is the top one, open, and above the
 * pill, set as a let-go or a tap picks the card's size, so it changes once
 * as the finger lifts, never with the finger; out of sight at once as the
 * card goes. Its height, measured as it resizes, is told (cardFeet's
 * useCardFootHeight) for the card's end room and scroll padding.
 */
export function CardFootSlot({ id, shown }: { id: string; shown: boolean }) {
  const host = useCardFeet((s) => s.host);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    putCardFoot(id, { el, shown, height: shown ? el.offsetHeight : 0 });
    if (!shown || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(([entry]) => {
      const height = Math.round(entry?.borderBoxSize[0]?.blockSize ?? el.offsetHeight);
      if (useCardFeet.getState().feet[id]?.height !== height) putCardFoot(id, { el, shown, height });
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [el, id, shown]);
  useLayoutEffect(() => (el ? () => putCardFoot(id, null) : undefined), [el, id]);
  if (!host) return null;
  return createPortal(
    <div
      ref={setEl}
      {...{ [CARD_FOOT]: id }}
      hidden={!shown}
      // Its own ground takes no touch: only the bar's capsule does.
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 print:hidden"
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
