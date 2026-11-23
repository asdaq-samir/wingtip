import { useSyncExternalStore } from "react";

/**
 * The window's safe-area insets, as numbers for what needs them in
 * JavaScript -- the map's room under the status bar (MapPanel's insets)
 * -- where everything else reads them in CSS (`env(safe-area-inset-*)`,
 * `dvh`).
 *
 * The insets come from a probe: an invisible element padded by
 * `env()`, read back through its computed style, since there is no
 * other way to ask the browser for them. They are re-read on a resize,
 * which is also what turning a phone fires.
 */
/** A reading of the window, taken once and again only when one of its
 *  events says it has changed -- not at every render of every component
 *  that asks (useSyncExternalStore's getSnapshot): the insets' read is a
 *  computed style, and asked for at every render it brought the whole
 *  page's styles up to date each time, 0.4 s of a phone's as a new route
 *  drew (measured 2026-10-07). */
function held<T>(read: () => T, events: (onChange: () => void) => () => void) {
  let value: T | undefined;
  let fresh = false;
  // Its own listener, for good and ahead of any component's: a change
  // while nothing was listening is still a change.
  let watching = false;
  const watch = () => {
    if (watching) return;
    watching = true;
    events(() => {
      fresh = false;
    });
  };
  return {
    subscribe: (onChange: () => void) => {
      watch();
      return events(onChange);
    },
    get: (): T => {
      watch();
      if (!fresh) {
        value = read();
        fresh = true;
      }
      return value as T;
    },
  };
}

const onResize = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};

let probe: HTMLDivElement | null = null;

function readInsets(): string {
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);
  }
  const style = getComputedStyle(probe);
  return `${style.paddingTop}|${style.paddingBottom}|${style.paddingLeft}|${style.paddingRight}`;
}

const insets = held(readInsets, onResize);

export function useSafeArea(): { top: number; bottom: number; left: number; right: number } {
  const [top = 0, bottom = 0, left = 0, right = 0] = useSyncExternalStore(insets.subscribe, insets.get, () => "0px|0px|0px|0px")
    .split("|")
    .map((v) => parseFloat(v) || 0);
  return { top, bottom, left, right };
}

/** How far a popover or menu keeps from the window's edges: past the
 *  status bar, the notch and the home indicator, then 8 more, where Base
 *  UI's stock 5 from the very edge let a menu at the top of the installed
 *  app (black-translucent status bar) sit under the clock (native audit
 *  L1). */
export function useEdgeRoom(): { top: number; bottom: number; left: number; right: number } {
  const { top, bottom, left, right } = useSafeArea();
  return { top: top + 8, bottom: bottom + 8, left: left + 8, right: right + 8 };
}

/** The visual viewport, which shrinks when the on-screen keyboard
 *  comes up (iOS leaves the layout viewport, and so `fixed` things,
 *  where they were), and moves as Safari scrolls the page to the
 *  focused field. */
const onVisual = (onChange: () => void) => {
  const visual = window.visualViewport;
  window.addEventListener("resize", onChange);
  visual?.addEventListener("resize", onChange);
  visual?.addEventListener("scroll", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    visual?.removeEventListener("resize", onChange);
    visual?.removeEventListener("scroll", onChange);
  };
};

/** The window's tallest height seen at its present width: a turn of the
 *  phone starts it again. */
let tallest = { width: 0, height: 0 };
/** Less than this short of the tallest is Safari's bars folding, not a
 *  keyboard: its toolbar and address bar are under 100 points together. */
const KEYBOARD_PX = 150;

const keyboard = held(() => {
  const visual = window.visualViewport;
  if (!visual) return "0|0";
  const inset = Math.max(0, Math.round(window.innerHeight - visual.height - visual.offsetTop));
  if (tallest.width !== window.innerWidth) tallest = { width: window.innerWidth, height: 0 };
  tallest.height = Math.max(tallest.height, window.innerHeight, visual.height);
  // Up when the visible part is well short of the window's tallest. iOS
  // 26's Safari shrinks the window itself with the keyboard, as Chrome on
  // Android does, so the window and the visual viewport agree and the
  // inset is 0 while the keyboard is up: the tab bar stayed over it (the
  // owner's iPhone, 2026-11-23). Only under a finger: a desktop's window
  // made shorter by hand is no keyboard.
  const touch = window.matchMedia("(any-pointer: coarse)").matches;
  const up = inset > 0 || (touch && tallest.height - visual.height > KEYBOARD_PX);
  return `${inset}|${up ? 1 : 0}`;
}, onVisual);
const useKeyboardReading = () => useSyncExternalStore(keyboard.subscribe, keyboard.get, () => "0|0").split("|");

/** How much of the bottom of the window the on-screen keyboard covers:
 *  0 with no keyboard, and where the browser shrinks the window for one
 *  instead (Chrome on Android, iOS 26's Safari), since the window's own
 *  height says it. For what is not in a sheet's Drawer (the route's
 *  suggestions, a popover put on the page's body): what is in one takes
 *  the stock Drawer's own (VirtualKeyboardProvider's
 *  --drawer-keyboard-inset). */
export function useKeyboardInset(): number {
  return Number(useKeyboardReading()[0]) || 0;
}

/** Whether the on-screen keyboard is up, by the same reading: covering
 *  the window's foot, or the window shrunk for it. What is put away while
 *  it is up, as iOS puts a tab bar away (MapPanel's foot bar), asks this. */
export function useKeyboardUp(): boolean {
  return useKeyboardReading()[1] === "1";
}
