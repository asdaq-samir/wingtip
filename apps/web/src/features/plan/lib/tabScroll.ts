import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Each of a card's tabs keeps its own place in the card's scroll, as the
 * one scrolling rule asks (the owner, 2026-11-10): back on a tab, the card
 * is where it was on it; a tab not yet seen opens where the card is. The
 * card's scroller is the nearest one round its tab bar (`bar`).
 */
export function useTabScroll(bar: RefObject<HTMLElement | null>, tab: string) {
  const places = useRef(new Map<string, number>());
  const shown = useRef(tab);
  useEffect(() => {
    const scroller = bar.current?.closest<HTMLElement>(".overflow-y-auto");
    if (!scroller) return;
    const keep = () => places.current.set(shown.current, scroller.scrollTop);
    scroller.addEventListener("scroll", keep, { passive: true });
    return () => scroller.removeEventListener("scroll", keep);
  }, [bar]);
  useLayoutEffect(() => {
    shown.current = tab;
    const at = places.current.get(tab);
    const scroller = bar.current?.closest<HTMLElement>(".overflow-y-auto");
    if (scroller && at !== undefined) scroller.scrollTop = at;
  }, [tab, bar]);
}
