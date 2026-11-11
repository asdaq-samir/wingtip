import { create } from "zustand";

/** The room over a phone's bottom sheet's top edge (MapPanel's slot in the
 *  Drawer's popup), while there is one. */
export const useSheetTop = create<{ slot: HTMLElement | null }>(() => ({ slot: null }));

/** MapPanel's ref for the slot: one function, so React does not take it
 *  away and put it back at each of the panel's renders. */
export function sheetTopRef(node: HTMLDivElement | null) {
  useSheetTop.setState({ slot: node });
  return () => useSheetTop.setState((s) => (s.slot === node ? { slot: null } : s));
}
