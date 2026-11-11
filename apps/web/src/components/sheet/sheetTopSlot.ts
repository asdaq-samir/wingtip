import { create } from "zustand";
import { useSheetCards } from "../../lib/sheetCards";

/** The room over a phone's bottom sheet's top edge, while there is one:
 *  the riding buttons' one container (OnSheetTop's portal), put in the
 *  front sheet's slot (MapPanel's, else the riding card's, CardStack);
 *  and the cards that have finished coming up. */
export const useSheetTop = create<{ slot: HTMLElement | null; up: string[] }>(() => ({ slot: null, up: [] }));

/** A card's drawer has finished opening or closing (the Drawer's
 *  onOpenChangeComplete). */
export function cardSettled(id: string, open: boolean) {
  useSheetTop.setState((s) => {
    const up = s.up.filter((card) => card !== id);
    return { up: open ? [...up, id] : up };
  });
}

/**
 * The card whose top the map's buttons ride, null for the sheet's: the
 * last card open that has finished coming up. So a card takes them once it
 * is up, not in the commit that opens it, when they jumped to a card still
 * below the screen and rode it up (the motion audit, 2026-11-11); and
 * gives them back as it starts to close, to the card under it or the
 * sheet, which stay where they are, rather than taking them down with it.
 */
export function useRidingCard(): string | null {
  const up = useSheetTop((s) => s.up);
  return useSheetCards((s) => [...s.stack].reverse().find((entry) => entry.shown && up.includes(entry.id))?.id ?? null);
}

/** The one container the riding buttons are drawn in, moved from slot to
 *  slot. A portal into a new container is a new subtree to React: when a
 *  card opened and the buttons moved to its top, the map's buttons were
 *  drawn afresh and lost what they held -- the Map button's card closed
 *  as it opened (the owner, 2026-11-11, measured in WebKit: aria-expanded
 *  true, then false). The same element moved in the page keeps them. */
let riding: HTMLDivElement | null = null;

/** The front sheet's slot's ref (SheetDrawer's, CardStack's): one
 *  function, so React does not take it away and put it back at each of
 *  their renders. */
export function sheetTopRef(node: HTMLDivElement | null) {
  if (!node) return;
  if (!riding) {
    riding = document.createElement("div");
    riding.style.display = "contents";
  }
  const kept = riding;
  node.appendChild(kept);
  useSheetTop.setState({ slot: kept });
  return () => {
    // One slot goes as the next comes in the same commit (the sheet's as a
    // card opens): left set while it is put in again, so nothing is drawn
    // afresh; with no slot after it, the buttons go back over the map.
    queueMicrotask(() => {
      if (!kept.isConnected) useSheetTop.setState({ slot: null });
    });
  };
}
