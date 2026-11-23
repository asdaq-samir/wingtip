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
const useSheetMoving = create<{ moving: boolean }>(() => ({ moving: false }));

/** Watches the sheet's popup (SheetDrawer's) for useSheetMoving while it
 *  is on the page. Answers the watch's end. */
export function watchSheetMotion(popup: HTMLElement): () => void {
  let swiping = popup.hasAttribute("data-swiping");
  let settling = false;
  const tell = () => {
    const moving = swiping || settling;
    if (useSheetMoving.getState().moving !== moving) useSheetMoving.setState({ moving });
  };
  const swiped = new MutationObserver(() => {
    swiping = popup.hasAttribute("data-swiping");
    tell();
  });
  swiped.observe(popup, { attributes: true, attributeFilter: ["data-swiping"] });
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
    useSheetMoving.setState({ moving: false });
  };
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
 *  sheet/FootBar, or SheetFoot's FootRestOf. */
export const FootRest = createContext<PanelState>("half");

/** The size the sheet has come to rest at, as the foot it is read in was told it. */
export function useFootRest(): PanelState {
  return useContext(FootRest);
}

/** The foot bar's height, px, while there is one (0 without): the map's
 *  room under a phone's bottom sheet is never less (MapPanel). */
export const useFootBarHeight = create<{ height: number }>(() => ({ height: 0 }));
