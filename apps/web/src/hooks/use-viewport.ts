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
  // The focus leaving a field puts the keyboard away before the window
  // has grown back; read again on each move of the focus. The leaving is
  // read a frame later: moving from one field to the next fires focusout
  // before focusin, and read between them, with no field focused, the
  // keyboard (still up on iOS) read as down for a moment, enough for a
  // layout read to start the foot bar's transition (the r9 audit).
  let frame = 0;
  const left = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      // Gone from every field: the window is measured afresh, so a turn
      // of the iPad with the keyboard up, which started the tallest at
      // the shrunk height, is put right by the next field's keyboard.
      if (!typing()) tallest.delete(window.innerWidth);
      onChange();
    });
  };
  document.addEventListener("focusin", onChange);
  document.addEventListener("focusout", left);
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener("focusin", onChange);
    document.removeEventListener("focusout", left);
    window.removeEventListener("resize", onChange);
    visual?.removeEventListener("resize", onChange);
    visual?.removeEventListener("scroll", onChange);
  };
};

/** The window's tallest height seen at each width: a turn of the phone
 *  back to a width seen before finds its tallest again, even with the
 *  keyboard up. */
const tallest = new Map<number, number>();
/** Less than this short of the tallest is Safari's bars folding, not a
 *  keyboard: its toolbar and address bar are under 100 points together. */
const KEYBOARD_PX = 150;

/** Whether the focus is in a field that takes typing: a text input, a
 *  textarea or editable content. Buttons, checkboxes and the like are
 *  inputs too, but bring up no keyboard. */
const NO_KEYBOARD = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);
function typing(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return !el.readOnly && !NO_KEYBOARD.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

const keyboard = held(() => {
  const visual = window.visualViewport;
  if (!visual) return "0|0";
  const inset = Math.max(0, Math.round(window.innerHeight - visual.height - visual.offsetTop));
  const tall = Math.max(tallest.get(window.innerWidth) ?? 0, window.innerHeight, visual.height);
  // A desktop window dragged wider meets a width a pixel at a time: keep
  // a phone's two and an iPad's few, not every one.
  if (tallest.size > 8 && !tallest.has(window.innerWidth)) tallest.clear();
  tallest.set(window.innerWidth, tall);
  // Up when the visible part is well short of the window's tallest. iOS
  // 26's Safari shrinks the window itself with the keyboard, as Chrome on
  // Android does, so the window and the visual viewport agree and the
  // inset is 0 while the keyboard is up: the tab bar stayed over it (the
  // owner's iPhone, 2026-11-23). Only under a finger, and only while a
  // field that takes typing has the focus, the one thing the on-screen
  // keyboard comes up for: a desktop's window, an iPad's window dragged
  // shorter or a touch laptop's is no keyboard (the r8 audit's W-L1).
  const touch = window.matchMedia("(any-pointer: coarse)").matches;
  const up = inset > 0 || (touch && typing() && tall - visual.height > KEYBOARD_PX);
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
