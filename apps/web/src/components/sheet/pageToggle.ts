import { create } from "zustand";
import type { SheetPages } from "../../lib/sheetPages";

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

// Each page draws its own toggle, so a turn takes away the one that was
// pressed. Where that one held the focus (the keyboard's Enter or Space),
// the next page's takes it as it is drawn: the focus was left on nothing,
// and the next Tab started again from the page's top (WCAG 2.4.3). A
// finger's tap gives a button no focus, and none is given then.
let handOn = false;

/** Before a turn: whether `el`, the toggle pressed, holds the focus. */
export function noteFocus(el: Element | null) {
  handOn = el != null && document.activeElement === el;
}

/** The toggle drawn after a turn takes the focus the pressed one held. */
export function takeFocus(el: HTMLElement | null) {
  if (!el || !handOn) return;
  handOn = false;
  el.focus({ preventScroll: true });
}
