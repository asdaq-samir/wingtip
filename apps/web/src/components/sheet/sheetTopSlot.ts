import { create } from "zustand";

/** The room over a phone's bottom sheet's top edge, while there is one:
 *  the riding buttons' one container (OnSheetTop's portal), put in the
 *  front sheet's slot (MapPanel's, else the top card's, CardStack). */
export const useSheetTop = create<{ slot: HTMLElement | null }>(() => ({ slot: null }));

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
