import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * A card's tabs and the card's scroll, as Apple Maps' place card has them
 * and the one scrolling rule asks (the owner, 2026-11-10; docs/design/rules.md
 * section 2): the pages start under the card's head (the airport card's
 * tabs float at its foot since C1, 2026-11-14; the element handed in marks
 * where the pages start, sticky under the head), and
 *  - back on a tab, the card is where it was on it;
 *  - a tab not yet seen, picked with the bar pinned, opens at its own top,
 *    just under the bar, not part way down (the scroll the last tab was at:
 *    the owner's recording, 2026-11-11, Weather scrolled then Info opened
 *    on its foot); with the bar not yet pinned, the card stays where it is;
 *  - a tab shorter than the card's room still leaves the bar where it
 *    pinned, the room under it blank, rather than the card jumping back to
 *    its top (Runways, in the same recording).
 * The card's scroller is the sheet's one scroller round its tab bar
 * (SheetParts' data-sheet-scroll), whose parent (the Tabs root) holds the
 * panels. The bar is the element handed to the returned setter, followed as it
 * comes and goes: a card's content waits for the engine (SheetCard's
 * EngineGate), so the bar is drawn after the card that calls this, and a
 * listener set up as the card mounted found no bar and was never added --
 * no tab kept its place (the browser runs, 2026-11-12).
 */
export function useTabScroll(tab: string) {
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const places = useRef(new Map<string, number>());
  const shown = useRef(tab);
  useEffect(() => {
    const scroller = bar?.closest<HTMLElement>(".overflow-y-auto");
    if (!scroller || !bar) return;
    const keep = () => places.current.set(shown.current, scroller.scrollTop);
    scroller.addEventListener("scroll", keep, { passive: true });
    // The room is kept as the scroller is resized, so it is in place before
    // any tab swaps: the owner's "Switching tabs jumps the page" (iPhone,
    // 2026-11-14) was a shorter page swapped in and measured first, whose
    // layout clamped scrollTop before the room was set, moving the head and
    // pictures; and a detent change left the room a tab's old figure.
    const reserve = () => reserveRoom(bar);
    const watch = new ResizeObserver(reserve);
    watch.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", keep);
      watch.disconnect();
    };
  }, [bar]);
  useLayoutEffect(() => {
    const was = shown.current;
    shown.current = tab;
    if (bar) placeTab(bar, was === tab ? undefined : (places.current.get(tab) ?? null));
  }, [tab, bar]);
  return [bar, setBar] as const;
}

/** Fits the Tabs root round `tabs` for its bar to stay pinned, and, on a
 *  tab picked (`kept` not undefined), scrolls to its kept place, or with
 *  none (null) to its top where the bar is pinned. */
function placeTab(tabs: HTMLElement, kept: number | null | undefined) {
  const root = tabs.parentElement;
  const scroller = tabs.closest<HTMLElement>(".overflow-y-auto");
  if (!root || !scroller) return;
  // Before any read that lays out the new, perhaps shorter, page.
  reserveRoom(tabs);
  // Where the bar pins: its place in the content (the Tabs root's top plus
  // the bar's margin, the root itself not sticky) less its sticky top.
  const style = getComputedStyle(tabs);
  const stickyTop = parseFloat(style.top) || 0;
  const margin = parseFloat(style.marginTop) || 0;
  const rootAt = root.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  const pinAt = rootAt + margin - stickyTop;
  if (kept === undefined) return;
  scroller.scrollTop = scrollOnPick(scroller.scrollTop, pinAt, kept);
}

/** Room for the pages to stay under the head whatever the tab's length,
 *  which keeps the floating bar, at the root's end, at the card's foot, and
 *  means a shorter page never lowers the scroller's end past where the
 *  head, facts and pictures are. */
function reserveRoom(tabs: HTMLElement) {
  const root = tabs.parentElement;
  const scroller = tabs.closest<HTMLElement>(".overflow-y-auto");
  if (!root || !scroller) return;
  const style = getComputedStyle(tabs);
  const stickyTop = parseFloat(style.top) || 0;
  const margin = parseFloat(style.marginTop) || 0;
  root.style.minHeight = `${Math.max(0, scroller.clientHeight - stickyTop + margin)}px`;
}

/** Where the scroller goes on a tab picked: back to the tab's kept place; a
 *  tab not yet seen (null) stays where the card is while the bar's pages
 *  are in sight (nothing above them moves), and starts at the pages' top
 *  (`pinAt`) when the card was scrolled past it (Apple Maps' place card). */
export function scrollOnPick(scrollTop: number, pinAt: number, kept: number | null): number {
  if (kept !== null) return kept;
  return Math.min(scrollTop, pinAt);
}
