import { useEffect } from "react";
import { askSearch } from "../lib/oneSearch";
import { wantScreen } from "../lib/navigation/wanted";
import type { ScreenId } from "../lib/navigation/generated/screens";
import { shortcutKey } from "../lib/shortcutKeys";

/**
 * The keyboard's ways round the planner, as a desktop's web apps have
 * them (the UI audit, 2026-11-09): `/` to the one search and Escape back
 * one level -- the close at the panel's top right, which goes back one
 * card, one list or one page (decision 0015) -- wherever the focus is
 * outside a field. A key a field, a menu or a dialog has used is left
 * alone. And the common actions a letter each, as the search's Do shows
 * them: Alt+B the Brief, Alt+N Nearest, Alt+D Direct To (the search, asked
 * for the airport), and Alt+/ the search. ⌘K or Ctrl K, the search itself,
 * is the search field's own (OneSearchField), on every screen with a
 * keyboard. The letters and `/` are pressed only with Alt (Option on a
 * Mac; lib/shortcutKeys), never alone, so VoiceOver's quick nav and the
 * browser's find-as-you-type keep their keys.
 */
/** The letters for the screens a pilot opens most (lib/navigation). */
export const SCREEN_KEYS: Partial<Record<ScreenId, string>> = { brief: "B", nearest: "N" };
/** And for Direct To, which the search asks the airport of. */
export const DIRECT_KEY = "D";

/** The panel's search field in sight: the one search, or a list's own. */
const SEARCH = '[data-slot="map-panel"] input[type="search"]';

/** Whether the key is a field's or a menu's: typed text, a list's own
 *  keys, a dialog over the page. */
export function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    !!target.closest("input, textarea, select, [role='menu'], [role='listbox'], [role='dialog'], [role='alertdialog']")
  );
}

const visible = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && (el.checkVisibility?.() ?? el.getClientRects().length > 0);

/** The search field asked for: the one in sight, else the one search's,
 *  which takes the ask (lib/oneSearch). */
function focusSearch(doc: Document): boolean {
  const here = [...doc.querySelectorAll(SEARCH)].find(visible);
  if (here) here.focus();
  else askSearch();
  return true;
}

/** Back one level: the close of the card on top in the panel (CardClose,
 *  SheetCard: `data-back`), or in the inspector beside the map (MapPanel,
 *  after the panel on the page, so its card's close is found first), where
 *  there is one in sight. */
export function backOne(doc: Document): boolean {
  const close =
    [...doc.querySelectorAll<HTMLElement>(':is([data-slot="map-panel"], [data-slot="map-inspector"]) [data-back]')]
      .reverse()
      .find(visible) ?? null;
  if (!visible(close)) return false;
  close.click();
  return true;
}

/** The shortcuts' handler, for a document (and its test). */
export function onShortcut(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  const doc = (event.target as Node | null)?.ownerDocument ?? document;
  if (event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    // In a field, its own Escape (a draft let go) comes first.
    if (typing(event.target)) return;
    if (backOne(doc)) event.preventDefault();
    return;
  }
  if (typing(event.target)) return;
  const letter = shortcutKey(event);
  if (!letter) return;
  if (letter === "/") {
    if (focusSearch(doc)) event.preventDefault();
    return;
  }
  const screen = (Object.keys(SCREEN_KEYS) as ScreenId[]).find((id) => SCREEN_KEYS[id] === letter);
  if (screen || letter === DIRECT_KEY) {
    event.preventDefault();
    if (screen) wantScreen(screen);
    else askSearch("direct");
  }
}

/** ⌘K on a Mac, Ctrl K elsewhere: the one search, from a field too (it
 *  is never a typed letter); OneSearchField listens for it. The physical
 *  key (`code`), as the letters are read (lib/shortcutKeys). */
export const isSearchKey = (event: KeyboardEvent): boolean =>
  (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === "KeyK";

/** The shortcuts on the page, wherever there is a keyboard: a desktop's,
 *  and an iPad's Magic Keyboard or any hardware one, whose pointer is
 *  still touch -- read off the desktop's fine pointer, Escape and Alt+B
 *  did nothing on an iPad with its keyboard (the iPad audit, 2026-11-21).
 *  A touch screen with none sends no keys outside a field, which typing
 *  leaves alone; the keys are shown (Kbd) on a desktop only. */
export function useShortcuts(): void {
  useEffect(() => {
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, []);
}
