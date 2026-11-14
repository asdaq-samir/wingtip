import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * A card's tabs and the card's scroll, as Apple Maps' place card has them
 * and the one scrolling rule asks (docs/design/rules.md section 2). Only
 * the card's head and its actions are over the pages (the owner,
 * 2026-11-14: "Info tab should start from the info strip and images and
 * the rest. Switching tabs should not show those"); the element handed in
 * marks where the pages start, sticky under the head. On a tab picked:
 *  - it opens at its own top, just under the actions: where the card was
 *    scrolled down into the last tab's page, to the pages' top; where the
 *    actions are still in sight, the card stays where it is, nothing above
 *    the pages moving;
 *  - a tab shorter than the card's room still leaves the pages where they
 *    were, the room under it blank, rather than the card jumping back to
 *    its top (Runways, the owner's recording, 2026-11-11), and the sheet's
 *    detent is not touched.
 * The card's scroller is the sheet's one scroller round its tab bar
 * (SheetParts' data-sheet-scroll), whose parent (the Tabs root) holds the
 * panels. The mark is the element handed to the returned setter, followed as it
 * comes and goes: a card's content waits for the engine (SheetCard's
 * EngineGate), so the mark is drawn after the card that calls this, and a
 * listener set up as the card mounted found none (the browser runs,
 * 2026-11-12).
 */
export function useTabScroll(tab: string) {
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const shown = useRef(tab);
  useEffect(() => {
    const scroller = bar?.closest<HTMLElement>(".overflow-y-auto");
    if (!scroller || !bar) return;
    // The room is kept as the scroller is resized, so it is in place before
    // any tab swaps: the owner's "Switching tabs jumps the page" (iPhone,
    // 2026-11-14) was a shorter page swapped in and measured first, whose
    // layout clamped scrollTop before the room was set; and a detent change
    // left the room a tab's old figure.
    const watch = new ResizeObserver(() => reserveRoom(bar));
    watch.observe(scroller);
    return () => watch.disconnect();
  }, [bar]);
  useLayoutEffect(() => {
    const was = shown.current;
    shown.current = tab;
    if (bar) placeTab(bar, was !== tab);
  }, [tab, bar]);
  return [bar, setBar] as const;
}

/** Fits the Tabs root round `tabs` for the pages to stay where they are,
 *  and, on a tab picked, brings its top into sight under the head. */
function placeTab(tabs: HTMLElement, picked: boolean) {
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
  if (picked) scroller.scrollTop = scrollOnPick(scroller.scrollTop, pinAt);
}

/** Room for the pages to stay under the head whatever the tab's length,
 *  which keeps the floating bar, at the root's end, at the card's foot, and
 *  means a shorter page never lowers the scroller's end past the pages'
 *  top, so the scroll is never clamped as a tab swaps. */
function reserveRoom(tabs: HTMLElement) {
  const root = tabs.parentElement;
  const scroller = tabs.closest<HTMLElement>(".overflow-y-auto");
  if (!root || !scroller) return;
  const style = getComputedStyle(tabs);
  const stickyTop = parseFloat(style.top) || 0;
  const margin = parseFloat(style.marginTop) || 0;
  root.style.minHeight = `${Math.max(0, scroller.clientHeight - stickyTop + margin)}px`;
}

/** Where the scroller goes on a tab picked: its page's top, `pinAt`, where
 *  the card was scrolled past it into the last tab's page; else where it is,
 *  the actions still in sight and nothing above the pages moving. */
export function scrollOnPick(scrollTop: number, pinAt: number): number {
  return Math.min(scrollTop, pinAt);
}
