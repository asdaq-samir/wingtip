import { useCallback, useEffect, useState } from "react";

/**
 * The finger's movement on a sheet handed to the few parts that read it.
 *
 * Base UI writes the finger's movement (--drawer-swipe-movement-y) on the
 * popup at every move, registered with `inherits: false` so nothing under
 * the popup is restyled by it. The popup once copied it into a plain
 * custom property (--sheet-swipe) for the parts held at its foot to read,
 * and a plain one inherits: every element of the sheet, the route, the
 * nav log, an open card, was restyled at every move of a finger (the
 * animation audit of 2026-11-23, H1: about 300 elements a move on FPL's
 * sheet and 580 on an airport card, at CPU 4x). Now --sheet-swipe is
 * registered with `inherits: false` too (index.css) and set here on the
 * parts that read it alone, marked SWIPE_READER, in the same task as Base
 * UI's own write (a MutationObserver's callback runs before the page is
 * drawn), so they move in the same frame as the sheet.
 *
 * Nothing follows a settle by script any more: FPL's figures, which rode
 * each settle by keyframes of their own (pinFollow), are a fixed bar
 * outside the sliding sheet now (sheet/FootBar; the sheet-motion audit of
 * 2026-11-23, option B).
 */

/** The class of a part that reads --sheet-swipe (sheet/insets' HOLD_AT_EDGE,
 *  SheetScroller's body cut). */
export const SWIPE_READER = "sheet-swipe";

const SHEET = ".group\\/sheet";
const MOVEMENT = "--drawer-swipe-movement-y";

/**
 * Watches a sheet's or a card's popup (SheetDrawer's, CardStack's): its
 * movement handed to its readers. Answers the watch's end.
 */
function relaySwipe(popup: HTMLElement): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  const swipe = () => popup.style.getPropertyValue(MOVEMENT) || "0px";
  // The readers found once and kept until the sheet's subtree changes (a
  // part added, removed or its class changed), not searched for at every
  // move of a finger (the motion audit of 2026-11-23, fpl-motion, low).
  let readers: HTMLElement[] | null = null;
  const find = () =>
    // A card's parts read their own card's movement, not the sheet's it is drawn in.
    [...popup.querySelectorAll<HTMLElement>(`.${SWIPE_READER}`)].filter((el) => el.closest(SHEET) === popup);
  const changed = new MutationObserver(() => {
    readers = null;
  });
  changed.observe(popup, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  const hand = (value: string) => {
    readers ??= find();
    for (const el of readers) {
      if (el.style.getPropertyValue("--sheet-swipe") !== value) el.style.setProperty("--sheet-swipe", value);
    }
  };
  hand(swipe());
  const watch = new MutationObserver(() => hand(swipe()));
  watch.observe(popup, { attributes: true, attributeFilter: ["style"] });
  return () => {
    watch.disconnect();
    changed.disconnect();
  };
}

/** A popup's ref that watches it (relaySwipe) while it is on the page, and
 *  hands it on to `also` (MapPanel's, for what it covers of the map). */
export function useSwipeRelay(also?: (node: HTMLElement | null) => void) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  useEffect(() => (node ? relaySwipe(node) : undefined), [node]);
  return useCallback(
    (next: HTMLElement | null) => {
      also?.(next);
      setNode(next);
    },
    [also],
  );
}
