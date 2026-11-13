import { useEffect } from "react";
import { create } from "zustand";

/** A floating card's box on the screen, in the page's pixels. */
export type CardBox = { top: number; left: number; width: number; height: number };

/**
 * Where each floating card open is drawn (FloatingCards), for the map to
 * keep what a card is about out from under it (map/cardRoom), as Apple
 * Maps keeps a place clear of its card. A riding card's room is the
 * sheet's (MapPanel's insets); a floating one covers the map apart from
 * the sheet, so its box is told here.
 */
export const useFloatRoom = create<{ boxes: Record<string, CardBox> }>(() => ({ boxes: {} }));

function tell(id: string, box: CardBox | null) {
  useFloatRoom.setState((s) => {
    const { [id]: was, ...rest } = s.boxes;
    if (!box) return was ? { boxes: rest } : s;
    if (was && was.top === box.top && was.left === box.left && was.width === box.width && was.height === box.height) return s;
    return { boxes: { ...rest, [id]: box } };
  });
}

/**
 * The box of a floating card's popup (`popup`, its scroller's parent),
 * told while it is open and again as it changes size -- its content
 * coming in, a section opened. Measured by layout (offset*), not its
 * painted box, so the fade-up it opens with (FloatingCard's slide-in) is
 * not taken for where it rests.
 */
export function useFloatBox(id: string, popup: HTMLElement | null, open: boolean) {
  useEffect(() => {
    if (!open || !popup) return;
    const measure = () =>
      tell(
        id,
        popup.offsetHeight > 0
          ? { top: popup.offsetTop, left: popup.offsetLeft, width: popup.offsetWidth, height: popup.offsetHeight }
          : null,
      );
    const watch = new ResizeObserver(measure);
    watch.observe(popup);
    measure();
    return () => {
      watch.disconnect();
      tell(id, null);
    };
  }, [id, popup, open]);
}
