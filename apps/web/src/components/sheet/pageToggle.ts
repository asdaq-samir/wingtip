import { create } from "zustand";
import type { SheetPages } from "./SheetPages";

/**
 * The sheet's pages as the toggle that turns them sees them (PageToggle,
 * drawn with the map's buttons, apart from the sheet in the tree): put
 * here by MapPanel while they can be turned -- in the workspace, not
 * flying -- else null, and the toggle is not drawn. And the toggle while
 * it shows FPL, for what points at it (the first flight's tip, FplTip).
 */
export const usePageToggle = create<{ pages: Pick<SheetPages, "at" | "go"> | null; plan: HTMLElement | null }>(() => ({
  pages: null,
  plan: null,
}));

/** The toggle's ref while it shows FPL: kept while it is drawn so, let go
 *  only if nothing has taken its place since. */
export function keepPlanButton(el: HTMLElement | null) {
  usePageToggle.setState({ plan: el });
  return () => {
    if (usePageToggle.getState().plan === el) usePageToggle.setState({ plan: null });
  };
}
