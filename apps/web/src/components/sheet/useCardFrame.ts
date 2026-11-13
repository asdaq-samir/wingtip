import { useLayoutEffect, useRef } from "react";
import { setCard, useSheetCards, type CardFrame, type CardState } from "../../lib/sheetCards";
import { useShown } from "../../lib/shown";

/**
 * A card's own floating Dialog (FloatingCards, `float`) or nested Drawer
 * over the map's sheet (CardStack), held while the caller draws it: the scroller its content is put into, once the
 * drawer is there. Open while what it is drawn in is in sight (lib/shown):
 * under a page put away (TabKept) it is kept, closed, and opens again as
 * it was when the page is back. `id` is the card's (useCardSize).
 *
 * Held in a layout effect, so the drawer and the content are on the page
 * in the same frame as the tap, never an empty card for a frame.
 */
export function useCardFrame(
  frame: CardFrame & { fullScreen?: boolean; title?: string; open?: boolean; float?: boolean },
  id: string,
): HTMLElement | null {
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
  const { fullScreen, title, testId, label, labelledBy, float } = frame;
  const state: CardState = shown ? "open" : "kept";
  const opened = useRef({ fullScreen, state, float });
  useLayoutEffect(() => {
    const { fullScreen, state, float } = opened.current;
    const entry = {
      id,
      float,
      fullScreen,
      state,
      slot: null,
      frame: {
        dismiss: latest.current.dismiss && ((details) => latest.current.dismiss?.(details)),
        initialFocus: latest.current.initialFocus,
        finalFocus: latest.current.finalFocus,
      } satisfies CardFrame,
    };
    // One opened again while its last drawer still closes takes its place.
    useSheetCards.setState((s) => ({ stack: [...s.stack.filter((e) => e.id !== id), entry] }));
    // Its caller gone (the Map card's close, an airplane's edit cancelled):
    // its drawer is closed, not taken off the page open, so Base UI's close
    // runs -- the focus handed back (finalFocus), the sheet told no card is
    // up over it, its focus manager's marks and Escape put back -- and the
    // entry goes once that close is done (CardStack's onOpenChangeComplete).
    // Taken off open, Escape after an airplane's edit cancelled no longer
    // closed Setup under it, and the focus was left on nothing. A drawer
    // never opened (no size yet) goes at once; a floating card's dialog
    // opens as it is drawn, and closes as the rest do.
    return () =>
      useSheetCards.setState((s) => ({
        stack: s.stack.flatMap((e) => (e.id !== id ? [e] : e.at === undefined && !e.float ? [] : [{ ...e, state: "leaving" as const }])),
      }));
  }, [id]);
  useLayoutEffect(() => setCard(id, { state }), [id, state]);
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
