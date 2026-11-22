import { useHotkeys } from "react-hotkeys-hook";
import { askSearch } from "../lib/oneSearch";
import { wantScreen } from "../lib/navigation/wanted";
import type { ScreenId } from "../lib/navigation/generated/screens";

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
 * browser's find-as-you-type keep their keys. Heard by react-hotkeys-hook
 * (MIT), the stock hook, rather than a keydown handler of our own (the
 * stock-parts audit, 2026-11-21).
 */
/** The letters for the screens a pilot opens most (lib/navigation). */
export const SCREEN_KEYS: Partial<Record<ScreenId, string>> = { brief: "B", nearest: "N" };
/** And for Direct To, which the search asks the airport of. */
export const DIRECT_KEY = "D";

/** The panel's search field in sight: the one search, or a list's own. */
const SEARCH = '[data-slot="map-panel"] input[type="search"]';

/** Whether the key is a field's or a menu's: typed text, a list's own
 *  keys, a dialog over the page. */
function typing(target: EventTarget | null): boolean {
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

/** How every shortcut is heard (react-hotkeys-hook): by the physical key
 *  (`code`), as Option and a letter on a Mac types another character
 *  (Option-B is ∫), with exactly the modifiers named, so Command, Control
 *  or Shift held is the browser's and the system's own; and not while a
 *  field, a menu or a dialog has the key ({@link typing}) or a handler
 *  before has used it. The library's own form-tag rule is off: `typing`
 *  is the one rule, the same for a card's letters (useCardKeys). */
export const HEARD = {
  enableOnFormTags: true,
  ignoreEventWhen: (event: KeyboardEvent) => event.defaultPrevented || typing(event.target),
} as const;

/** A letter's hotkey, as the library names it: Alt held (lib/shortcutKeys). */
export const altKey = (letter: string) => `alt+${letter.toLowerCase()}`;

/** The letter a hotkey was heard as, upper case, as SCREEN_KEYS has it. */
const letterOf = (keys: readonly string[] | undefined) => keys?.[0]?.toUpperCase();

/** The shortcuts on the page, wherever there is a keyboard: a desktop's,
 *  and an iPad's Magic Keyboard or any hardware one, whose pointer is
 *  still touch -- read off the desktop's fine pointer, Escape and Alt+B
 *  did nothing on an iPad with its keyboard (the iPad audit, 2026-11-21).
 *  A touch screen with none sends no keys outside a field, which typing
 *  leaves alone; the keys are shown (Kbd) on a desktop only. `on` false
 *  holds them, for a test. */
export function useShortcuts(on = true): void {
  // Escape is not a character key: it goes back one level alone, no Alt.
  useHotkeys(
    "escape",
    (event) => {
      if (backOne(document)) event.preventDefault();
    },
    HEARD,
  );
  useHotkeys(
    "alt+slash",
    (event) => {
      if (focusSearch(document)) event.preventDefault();
    },
    HEARD,
  );
  useHotkeys(
    [...Object.values(SCREEN_KEYS).filter((key): key is string => !!key), DIRECT_KEY].map(altKey),
    (event, hotkey) => {
      const letter = letterOf(hotkey.keys);
      const screen = (Object.keys(SCREEN_KEYS) as ScreenId[]).find((id) => SCREEN_KEYS[id] === letter);
      event.preventDefault();
      if (screen) wantScreen(screen);
      else askSearch("direct");
    },
    HEARD,
  );
}

/** ⌘K on a Mac, Ctrl K elsewhere: the one search, from a field too (it
 *  is never a typed letter); OneSearchField's, with `run`. */
export function useSearchKey(run: () => void): void {
  useHotkeys(
    ["meta+k", "ctrl+k"],
    (event) => {
      event.preventDefault();
      run();
    },
    { enableOnFormTags: true, enableOnContentEditable: true, ignoreEventWhen: (event) => event.defaultPrevented },
  );
}
