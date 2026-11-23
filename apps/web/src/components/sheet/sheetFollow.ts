import { useCallback, useEffect, useState } from "react";

/**
 * The finger's movement on a sheet handed to the few parts that read it,
 * and the start of each settle told to the parts that follow it by script.
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
 * And a settle -- the finger lifted, or a size set by a tap -- told to the
 * parts that follow the sheet by an animation of their own (usePinAtFoot's
 * figures, `onSettle`), with where the popup is drawn now and where it is
 * going, before they are handed the new movement.
 */

/** The class of a part that reads --sheet-swipe (sheet/insets' HOLD_AT_EDGE,
 *  pinAtFoot's PIN_AT_FOOT and MAKES_WAY, SheetScroller's body cut). */
export const SWIPE_READER = "sheet-swipe";

/** What a part following the sheet by script is told as a settle starts:
 *  the popup's slide drawn now (`from`, px, read off its transform, mid-ease
 *  too) and where it is going (`to`, its snap offset), and the offset and
 *  movement it was told last (`was`), so it can work out where it was
 *  drawn before the change; and whether the popup eases there at all
 *  (`eased`: not before it is first drawn where it rests, useDrawn). */
export type Settle = { popup: HTMLElement; from: number; to: number; eased: boolean; was: { offset: string; swipe: string } };

type Follower = { popup: () => HTMLElement | null; settle: (s: Settle) => void; swiped?: () => void };

const followers = new Set<Follower>();

/** A part that follows its sheet's settle by script: told each settle of
 *  the popup it is in (`popup`, read at the settle), and a finger taking
 *  the sheet (`swiped`). Answers its removal. */
export function onSettle(follower: Follower): () => void {
  followers.add(follower);
  return () => followers.delete(follower);
}

const SHEET = ".group\\/sheet";
const MOVEMENT = "--drawer-swipe-movement-y";
const OFFSET = "--drawer-snap-point-offset";

/** How far the popup is slid now by its transform, mid-transition too. */
export function slidOf(el: Element): number {
  if (typeof DOMMatrixReadOnly === "undefined") return 0;
  return new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
}

/**
 * Watches a sheet's or a card's popup (SheetDrawer's, CardStack's): its
 * movement handed to its readers, and a settle told to its followers.
 * Answers the watch's end.
 */
export function relaySwipe(popup: HTMLElement): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  let swipe = popup.style.getPropertyValue(MOVEMENT) || "0px";
  let offset = popup.style.getPropertyValue(OFFSET);
  let swiping = popup.hasAttribute("data-swiping");
  const hand = (value: string) => {
    for (const el of popup.querySelectorAll<HTMLElement>(`.${SWIPE_READER}`)) {
      // A card's parts read their own card's movement, not the sheet's it is drawn in.
      if (el.closest(SHEET) !== popup) continue;
      if (el.style.getPropertyValue("--sheet-swipe") !== value) el.style.setProperty("--sheet-swipe", value);
    }
  };
  hand(swipe);
  const watch = new MutationObserver(() => {
    const nextSwipe = popup.style.getPropertyValue(MOVEMENT) || "0px";
    const nextOffset = popup.style.getPropertyValue(OFFSET);
    const nextSwiping = popup.hasAttribute("data-swiping");
    const mine = [...followers].filter((f) => f.popup() === popup);
    if (nextSwiping && !swiping) for (const f of mine) f.swiped?.();
    const target = (o: string, s: string) => (parseFloat(o) || 0) + (parseFloat(s) || 0);
    // Not under a finger, the place it is going changed: a settle starts.
    const settles = !nextSwiping && target(nextOffset, nextSwipe) !== target(offset, swipe) && mine.length > 0;
    const was = { offset, swipe };
    swipe = nextSwipe;
    offset = nextOffset;
    swiping = nextSwiping;
    if (!settles) return hand(nextSwipe);
    const style = getComputedStyle(popup);
    const from = slidOf(popup);
    // A card is slid from the sheet's offset it is drawn in (CardStack's
    // --sheet-base), so where it goes is told in the same terms as its transform.
    const base = popup.parentElement?.closest(SHEET) ? parseFloat(style.getPropertyValue("--sheet-base")) || 0 : 0;
    const eased = parseFloat(style.transitionDuration) > 0.01;
    hand(nextSwipe);
    for (const f of mine) f.settle({ popup, from, to: target(nextOffset, nextSwipe) - base, eased, was });
  });
  watch.observe(popup, { attributes: true, attributeFilter: ["style", "data-swiping"] });
  return () => watch.disconnect();
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
