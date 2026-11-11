import { useEffect } from "react";
import { closeTopCard, useOpenCards } from "./openCards";

/**
 * A device's own Back -- Android's gesture or button, a TV remote's --
 * on the site: what Escape does, the topmost thing closed, a menu, a
 * dialog, the layers (each takes the key and says so, preventDefault), else the
 * top card closed (an airport's, Nearest's: lib/openCards), else the
 * panel lowered (its own Escape, MapPanel). Answers whether anything was
 * open to close; with nothing, the caller puts the app away. Not the web
 * view's history: the planner keeps its state in the address with each
 * change replacing the last, so going back would leave the app, or land
 * on a spent sign-in link.
 */
export function closeTopmost(): boolean {
  if (escapeAt(document.activeElement ?? document.body)) return true;
  if (closeTopCard()) return true;
  const panel = document.querySelector<HTMLElement>('[data-slot="map-panel"]');
  if (panel && panel.dataset.panel !== "peek") {
    escapeAt(panel);
    return true;
  }
  return false;
}

/** Escape pressed at an element: whether anything took it. */
function escapeAt(target: Element): boolean {
  const key = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true });
  target.dispatchEvent(key);
  return key.defaultPrevented;
}

/** The browser's CloseWatcher (Chrome 120 on, Android's Back among its
 *  close requests); TypeScript's DOM types have none yet. */
type CloseWatcher = { onclose: (() => void) | null; destroy(): void };
type CloseWatchers = { CloseWatcher?: new () => CloseWatcher };

/**
 * Android's Back (and the browser's own close requests) on the web:
 * the top thing closed, as on a TV (closeTopmost), through the
 * platform's stock CloseWatcher -- no history entries, the address still
 * replaced at each change. A watcher is held only while something is
 * open (a card, a list, the sheet above its pill: `raised`), so with
 * nothing to close Back leaves the app as the browser's own would; it
 * is made again after each Back while there is more. Where the browser
 * has no CloseWatcher (Safari), its Back is left as it is. Only on a
 * touch screen: a desktop's close request is the Escape key, which the
 * page already takes itself, and a watcher there would close twice.
 */
export function useBackCloses(raised: boolean) {
  const open = useOpenCards((cards) => cards.total > 0) || raised;
  useEffect(() => {
    const Watcher = (window as CloseWatchers).CloseWatcher;
    if (!open || !Watcher || !matchMedia("(pointer: coarse)").matches) return;
    let watcher: CloseWatcher | null = null;
    const watch = () => {
      watcher = new Watcher();
      watcher.onclose = () => {
        closeTopmost();
        watch();
      };
    };
    watch();
    return () => {
      if (!watcher) return;
      watcher.onclose = null;
      watcher.destroy();
    };
  }, [open]);
}
