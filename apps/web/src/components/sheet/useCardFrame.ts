import { useLayoutEffect, useRef } from "react";
import { setCard, useSheetCards, type CardFrame } from "../../lib/sheetCards";
import { useShown } from "../../lib/shown";

/**
 * A card's own nested Drawer over the map's sheet (CardStack), held while
 * the caller draws it: the scroller its content is put into, once the
 * drawer is there. Open while what it is drawn in is in sight (lib/shown):
 * under a page put away (TabKept) it is kept, closed, and opens again as
 * it was when the page is back. `id` is the card's (useCardSize).
 *
 * Held in a layout effect, so the drawer and the content are on the page
 * in the same frame as the tap, never an empty card for a frame.
 */
export function useCardFrame(frame: CardFrame & { fullScreen?: boolean; title?: string; open?: boolean }, id: string): HTMLElement | null {
  // A card kept between its openings (`open`, CardLayer's) is shown only
  // while it is open; one drawn only while open is open while drawn.
  const open = frame.open ?? true;
  const shown = useShown() && open;
  const slot = useSheetCards((s) => s.stack.find((entry) => entry.id === id)?.slot ?? null);
  // The caller's latest, read as the Drawer tells it something.
  const latest = useRef(frame);
  useLayoutEffect(() => {
    latest.current = frame;
  });
  const { fullScreen, title, testId, label, labelledBy } = frame;
  const opened = useRef({ fullScreen, shown });
  useLayoutEffect(() => {
    const { fullScreen, shown } = opened.current;
    const entry = {
      id,
      fullScreen,
      shown,
      slot: null,
      frame: {
        dismiss: latest.current.dismiss && ((details) => latest.current.dismiss?.(details)),
        initialFocus: latest.current.initialFocus,
        finalFocus: latest.current.finalFocus,
      } satisfies CardFrame,
    };
    useSheetCards.setState((s) => ({ stack: [...s.stack, entry] }));
    return () => useSheetCards.setState((s) => ({ stack: s.stack.filter((e) => e.id !== id) }));
  }, [id]);
  useLayoutEffect(() => setCard(id, { shown }), [id, shown]);
  // Opened again by the pilot, it opens by the card rule's 2 as a new card
  // does (CardStack's cardOpening), not at the size it was put away at;
  // kept closed under a card over it, it comes back as it was.
  useLayoutEffect(() => {
    if (open) setCard(id, { at: undefined });
  }, [id, open]);
  useLayoutEffect(() => setCard(id, { title }), [id, title]);
  useLayoutEffect(() => {
    const was = useSheetCards.getState().stack.find((e) => e.id === id)?.frame;
    if (was && (was.testId !== testId || was.label !== label || was.labelledBy !== labelledBy))
      setCard(id, { frame: { ...was, testId, label, labelledBy } });
  }, [id, testId, label, labelledBy]);
  return slot;
}
