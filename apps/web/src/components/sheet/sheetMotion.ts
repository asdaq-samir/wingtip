import { createContext, useContext, useEffect, useState } from "react";
import { create } from "zustand";
import type { PanelState } from "../../lib/mapChrome";

/**
 * Whether the phone's sheet is moving now: a finger on it, or its slide
 * to a size under way. Fed by Base UI's own signals on its popup and
 * nothing else: its data-swiping while a finger has it, and the popup's
 * transform transition from its start to its end (transitionrun to
 * transitionend or transitioncancel), a let-go or a size set by a tap.
 * No timer guesses the Drawer's time (the simplicity audit of 2026-11-23,
 * item 3: four detectors of one event, one of them a SETTLE_MS guess that
 * failed on a slow runner).
 */
const useSheetMoving = create<{ moving: boolean; offset: number }>(() => ({ moving: false, offset: 0 }));

/** The Drawer's own snap offset on a sheet's or a card's popup, as Base UI
 *  writes it (--drawer-snap-point-offset): where it rests, or is going to
 *  rest, not where a finger has it. Read here alone. */
export function snapOffset(popup: HTMLElement | null | undefined): string | undefined {
  return popup?.style.getPropertyValue("--drawer-snap-point-offset") || undefined;
}

/** The phone's sheet's snap offset, px: where it will rest, set as a
 *  let-go or a tap picks its size, not changed by a finger's drag or the
 *  slide (watchSheetMotion). 0 all the way up and with no bottom sheet. */
export function useSheetRestOffset(): number {
  return useSheetMoving((s) => s.offset);
}

/** Follows a drawer's popup (the sheet's, a card's) from Base UI's own
 *  signals: `told(moving)` at each of them, `moving` while a finger has it
 *  (data-swiping) or its own slide runs (its transform's transitionrun to
 *  transitionend or transitioncancel). Answers the watch's end. */
function followPopup(popup: HTMLElement, told: (moving: boolean) => void): () => void {
  let swiping = popup.hasAttribute("data-swiping");
  let settling = false;
  const tell = () => told(swiping || settling);
  // Base UI writes the finger's movement on the popup's style at every
  // move, which changes nothing here; the offset only at a new rest.
  const swiped = new MutationObserver(() => {
    swiping = popup.hasAttribute("data-swiping");
    // A new swipe ends any slide before it: one cut off with neither
    // transitionend nor transitioncancel (the popup detached, its display
    // changed) would leave `settling` on and useRestSize frozen till the
    // next slide (the r7 audit's W-L4).
    if (swiping) settling = false;
    tell();
  });
  swiped.observe(popup, { attributes: true, attributeFilter: ["data-swiping", "style"] });
  // The popup's own slide, not a transition of something inside it.
  const ours = (e: TransitionEvent) => e.target === popup && e.propertyName === "transform";
  const run = (e: TransitionEvent) => {
    if (!ours(e)) return;
    settling = true;
    tell();
  };
  const end = (e: TransitionEvent) => {
    if (!ours(e)) return;
    settling = false;
    tell();
  };
  popup.addEventListener("transitionrun", run);
  popup.addEventListener("transitionend", end);
  popup.addEventListener("transitioncancel", end);
  tell();
  return () => {
    swiped.disconnect();
    popup.removeEventListener("transitionrun", run);
    popup.removeEventListener("transitionend", end);
    popup.removeEventListener("transitioncancel", end);
  };
}

/** Watches the sheet's popup (SheetDrawer's) for useSheetMoving while it
 *  is on the page. Answers the watch's end. */
export function watchSheetMotion(popup: HTMLElement): () => void {
  const stop = followPopup(popup, (moving) => {
    const offset = parseFloat(snapOffset(popup) ?? "") || 0;
    const was = useSheetMoving.getState();
    if (was.moving !== moving || was.offset !== offset) useSheetMoving.setState({ moving, offset });
  });
  return () => {
    stop();
    useSheetMoving.setState({ moving: false, offset: 0 });
  };
}

/**
 * Whether a card's popup is still, `wanted` and the card neither under a
 * finger nor sliding (followPopup): false at once as either starts, true
 * two frames after both end, so a slide a tap or an opening has just set
 * going (its transitionrun a frame on) is seen first, as useRestSize's
 * size is. A card's tab bar at the screen's foot (sheet/CardFoot) goes
 * once its card has come to rest at the pill.
 */
export function usePopupStill(popup: HTMLElement | null, wanted: boolean): boolean {
  const [moving, setMoving] = useState(true);
  useEffect(() => (popup ? followPopup(popup, setMoving) : undefined), [popup]);
  const [still, setStill] = useState(false);
  const want = wanted && !moving && !!popup;
  if (!want && still) setStill(false);
  useEffect(() => {
    if (!want) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setStill(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [want]);
  return want && still;
}

/**
 * The size the sheet has come to rest at: `size`, the page's, taken only
 * once the sheet is still (useSheetMoving), so what reads it changes once
 * the slide is over, never with the finger or mid-slide. A size set by a
 * tap is the page's a frame before its slide starts, so it is taken two
 * frames on, once the slide would have begun: begun, the sheet is moving
 * and the size waits for its end; not begun (the side panel, a sheet not
 * yet drawn), it is taken then.
 */
export function useRestSize(size: PanelState): PanelState {
  const moving = useSheetMoving((s) => s.moving);
  const [rest, setRest] = useState(size);
  useEffect(() => {
    if (moving || rest === size) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setRest(size));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [moving, rest, size]);
  return rest;
}

/** The size the sheet rests at, for what the foot shows (FPL's figures,
 *  thin or the pill's size, and its tab bar in or folded away): told by
 *  SheetFoot's FootRestOf, or by sheet/FootBar the size the sheet is
 *  going to, from the let-go. */
export const FootRest = createContext<PanelState>("half");

/** The size the sheet has come to rest at, as the foot it is read in was told it. */
export function useFootRest(): PanelState {
  return useContext(FootRest);
}

/** The foot bar's height, px, while there is one (0 without): the map's
 *  room under a phone's bottom sheet is never less (MapPanel). And
 *  `pill`, its height last measured folded at the pill, which with the
 *  grabber's room is FPL's pill snap point (sheet/insets' footPillPx):
 *  kept while it is unfolded, so the pill is not moved by the tabs. */
export const useFootBarHeight = create<{ height: number; pill: number }>(() => ({ height: 0, pill: 0 }));
