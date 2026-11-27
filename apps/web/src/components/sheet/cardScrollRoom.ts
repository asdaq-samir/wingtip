import { useEffect, useRef } from "react";

/** What sticks over a card's scroller: its pinned head (PinnedHead's
 *  data-sheet-head) at the top, a bar of tabs (CardTabBar) at the foot
 *  where the bar is in the card (the side panel, a top sheet). */
const HEAD = "[data-sheet-head]";
const FOOT = ".sticky.bottom-0";

/**
 * A card's scroll padding, the heights of what sticks over its scroller:
 * a row focused or brought into view comes to rest clear of the pinned
 * head and of a tab bar at the foot, never under either (WCAG 2.4.11).
 * Measured, as a head with a line or a verdict under its name is taller
 * than any fixed room (the HIG audit of 2026-11-26, M2); with nothing
 * measured the scroller's own class keeps its room. Each is found as the
 * card's content is put in and changes, and measured as it resizes. On a
 * phone's bottom sheet the bar stands in the card's foot slot beside it
 * (sheet/CardFoot), not in the scroller: its height is `footPx`.
 */
export function useCardScrollRoom(scroller: HTMLElement | null, footPx = 0) {
  const slotted = useRef(footPx);
  useEffect(() => {
    slotted.current = footPx;
    if (!scroller) return;
    if (footPx) scroller.style.setProperty("scroll-padding-bottom", `${footPx}px`);
    else if (!scroller.querySelector(FOOT)) scroller.style.removeProperty("scroll-padding-bottom");
  }, [scroller, footPx]);
  useEffect(() => {
    if (!scroller || typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined") return;
    let head: HTMLElement | null = null;
    let foot: HTMLElement | null = null;
    const room = (side: "top" | "bottom", el: HTMLElement | null) => {
      const px = side === "bottom" && !el ? slotted.current : el?.offsetHeight;
      if (px) scroller.style.setProperty(`scroll-padding-${side}`, `${px}px`);
      else scroller.style.removeProperty(`scroll-padding-${side}`);
    };
    const sizes = new ResizeObserver(() => {
      room("top", head);
      room("bottom", foot);
    });
    const find = () => {
      const nowHead = scroller.querySelector<HTMLElement>(HEAD);
      const nowFoot = scroller.querySelector<HTMLElement>(FOOT);
      if (nowHead === head && nowFoot === foot) return;
      head = nowHead;
      foot = nowFoot;
      sizes.disconnect();
      for (const el of [head, foot]) if (el) sizes.observe(el);
      room("top", head);
      room("bottom", foot);
    };
    const parts = new MutationObserver(find);
    parts.observe(scroller, { childList: true, subtree: true });
    find();
    return () => {
      parts.disconnect();
      sizes.disconnect();
      scroller.style.removeProperty("scroll-padding-top");
      scroller.style.removeProperty("scroll-padding-bottom");
    };
  }, [scroller]);
}
