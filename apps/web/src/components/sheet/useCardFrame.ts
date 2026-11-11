import { useLayoutEffect, useRef } from "react";
import { setCard, useSheetCards, type CardFrame } from "../../lib/sheetCards";
import { useShown } from "../../lib/shown";
import type { PanelState } from "../../lib/mapChrome";

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
export function useCardFrame(
  frame: CardFrame & { raise?: "half" | "full"; opens?: PanelState; title?: string },
  id: string,
): HTMLElement | null {
  const shown = useShown();
  const slot = useSheetCards((s) => s.stack.find((entry) => entry.id === id)?.slot ?? null);
  // The caller's latest, read as the Drawer tells it something.
  const latest = useRef(frame);
  useLayoutEffect(() => {
    latest.current = frame;
  });
  const { raise, opens, title, testId, label, labelledBy } = frame;
  const opened = useRef({ raise, opens, shown });
  useLayoutEffect(() => {
    const { raise, opens, shown } = opened.current;
    const entry = {
      id,
      raise,
      opens,
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
  useLayoutEffect(() => setCard(id, { title }), [id, title]);
  useLayoutEffect(() => {
    const was = useSheetCards.getState().stack.find((e) => e.id === id)?.frame;
    if (was && (was.testId !== testId || was.label !== label || was.labelledBy !== labelledBy))
      setCard(id, { frame: { ...was, testId, label, labelledBy } });
  }, [id, testId, label, labelledBy]);
  return slot;
}
