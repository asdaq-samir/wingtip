import { useLayoutEffect, type RefObject } from "react";
import type { PanelTab } from "../plan";

/**
 * The focus kept in the Brief's card when what had it goes with the page
 * the pilot chose: a glance's tile opening its page, a tab as the overview
 * comes back. Left on nothing, Base UI's restoreFocus (the Drawer's
 * FloatingFocusManager) gave it to the popup of FPL's sheet, which the
 * card is drawn in, behind the card -- and again a frame later, taking it
 * from the tab an arrow key had just moved it to (checkpoints.spec,
 * 2026-11-18). The card's own popup holds it in the commit that took the
 * old one away; the tab up, or the overview's first control, takes it a
 * frame on, once the tabs know their order: focused in that commit, an
 * arrow key from it went from the first tab, not from it.
 */
export function useFocusKept(
  tab: PanelTab | null,
  hadFocusRef: RefObject<boolean>,
  headRef: RefObject<HTMLElement | null>,
  pagesRef: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const lost = hadFocusRef.current && document.activeElement === document.body;
    hadFocusRef.current = false;
    if (!lost) return;
    pagesRef.current?.closest<HTMLElement>("[data-sheet-card]")?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => {
      const to = tab
        ? headRef.current?.querySelector<HTMLElement>(`[data-testid="panel-tab-${tab}"]`)
        : pagesRef.current?.querySelector<HTMLElement>("button, a[href], [tabindex='0']");
      to?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, hadFocusRef, headRef, pagesRef]);
}
