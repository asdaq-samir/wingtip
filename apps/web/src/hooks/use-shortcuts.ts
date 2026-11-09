import { useEffect } from "react";

/**
 * The keyboard's ways round the planner, as a desktop's web apps have
 * them (the UI audit, 2026-11-09): `/` to the search, 1 to 4 for the
 * panel's tabs (FPL, Airport, Airplane, Setup) and Escape back one level
 * -- the close at the panel's top right, which goes back one card, one
 * list or one page (decision 0015) -- wherever the focus is outside a
 * field. A key a field, a menu or a dialog has used is left alone.
 */
const TAB_KEYS: Record<string, string> = { "1": "tab-fpl", "2": "tab-airport", "3": "tab-aircraft", "4": "setup-button" };

/** The panel's search field in sight: the tab's own. */
const SEARCH = '[data-slot="map-panel"] input[type="search"]';

/** Whether the key is a field's or a menu's: typed text, a list's own
 *  keys, a dialog over the page. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || !!target.closest("input, textarea, select, [role='menu'], [role='listbox'], [role='dialog'], [role='alertdialog']");
}

const visible = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && (el.checkVisibility?.() ?? el.getClientRects().length > 0);

/** The search field asked for: the one in sight, else Airport's, its tab
 *  opened first. */
function focusSearch(doc: Document): boolean {
  const here = [...doc.querySelectorAll(SEARCH)].find(visible);
  if (here) { here.focus(); return true; }
  const airport = doc.querySelector('[data-testid="tab-airport"]');
  if (!visible(airport)) return false;
  airport.click();
  requestAnimationFrame(() => [...doc.querySelectorAll(SEARCH)].find(visible)?.focus());
  return true;
}

/** Back one level: the panel's close, where there is one in sight. */
export function backOne(doc: Document): boolean {
  const close = doc.querySelector('[data-slot="map-panel"] [data-testid="tab-close"]');
  if (!visible(close)) return false;
  close.click();
  return true;
}

/** The shortcuts' handler, for a document (and its test). */
export function onShortcut(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const doc = (event.target as Node | null)?.ownerDocument ?? document;
  if (event.key === "Escape") {
    // In a field, its own Escape (a draft let go) comes first.
    if (typing(event.target)) return;
    if (backOne(doc)) event.preventDefault();
    return;
  }
  if (typing(event.target)) return;
  if (event.key === "/") {
    if (focusSearch(doc)) event.preventDefault();
    return;
  }
  const tab = TAB_KEYS[event.key];
  const button = tab ? doc.querySelector(`[data-testid="${tab}"]`) : null;
  if (visible(button)) {
    event.preventDefault();
    button.click();
  }
}

/** The shortcuts on the page while `on` (a desktop's: useIsDesktop). */
export function useShortcuts(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, [on]);
}
