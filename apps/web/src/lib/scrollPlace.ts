import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Going back returns to where you were, opening something new starts at
 * the top (the one scrolling rule, the owner 2026-11-10): as something is
 * opened in place of a list (`away`), the list's scroller (the nearest one
 * round `anchor`) is kept where it was and put at its top; as it closes,
 * the list's place is put back.
 */
export function useScrollPlace(anchor: RefObject<HTMLElement | null>, away: boolean) {
  const kept = useRef<number | null>(null);
  useEffect(() => {
    const scroller = anchor.current?.closest<HTMLElement>(".overflow-y-auto");
    if (!scroller) return;
    if (away) {
      kept.current ??= scroller.scrollTop;
      scroller.scrollTo({ top: 0 });
    } else if (kept.current !== null) {
      scroller.scrollTop = kept.current;
      kept.current = null;
    }
  }, [anchor, away]);
}

/** The sheet's one scroller round `node` (SheetParts' data-sheet-scroll),
 *  or the nearest one where it is drawn outside the sheet. */
export function sheetScroller(node: HTMLElement | null): HTMLElement | null {
  return node?.closest<HTMLElement>("[data-sheet-scroll], .overflow-y-auto") ?? null;
}

/**
 * Something opened anew in the sheet -- a card, a tab's page -- starts at
 * the top (the one scrolling rule): the sheet's one scroller (SheetParts)
 * put at its top as it is first drawn in sight. Out of sight (a kept tab's,
 * tab-away) it leaves the scroller to what is shown.
 */
export function useStartAtTop(anchor: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const node = anchor.current;
    if (!node || node.closest(".tab-away")) return;
    const scroller = sheetScroller(node);
    if (scroller) scroller.scrollTop = 0;
  }, [anchor]);
}

/**
 * A view kept under others (TabKept: a tab, a card under a card) keeps its
 * own place in the sheet's one scroller, as iOS keeps a tab's screen: while
 * `shown` it notes where the scroller is, and shown again it is put back
 * there, the scroller then holding this view's content again.
 */
export function useKeptScroll(anchor: RefObject<HTMLElement | null>, shown: boolean) {
  const place = useRef(0);
  useLayoutEffect(() => {
    const scroller = shown ? sheetScroller(anchor.current) : null;
    if (!scroller) return;
    scroller.scrollTop = place.current;
    const note = () => {
      place.current = scroller.scrollTop;
    };
    scroller.addEventListener("scroll", note, { passive: true });
    return () => scroller.removeEventListener("scroll", note);
  }, [anchor, shown]);
}
