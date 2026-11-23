import type { Map as GlMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useSlidingSheet, type MapInsets, type SlidingSheet } from "../../lib/mapChrome";
import { cameraOf } from "../../lib/map/gl/camera";
import { DRAWER_MS } from "../sheet/insets";
import { drawerEasing } from "./drawerEasing";
import { padOf } from "./makeMap";

/** Frames the sheet is still watched once a finger lets it go, for its
 *  settle to begin (the popup's transitionrun): counted in frames, not
 *  time, since the render the let-go starts can hold the page for longer
 *  than any wait in milliseconds, and no frame is drawn meanwhile. */
const LET_GO_FRAMES = 4;

/**
 * The map slid with a phone's bottom sheet frame by frame, under the finger
 * and through its settle, so the two land on the same frame: the map's
 * padding is what the sheet covers where it is drawn this frame, read off
 * the popup's own rect (getBoundingClientRect), between the pill's and
 * half's (all the way up, the map keeps half's room). Not the Drawer's
 * motion mirrored (its variables, 278b67c62): where the sheet is, measured.
 *
 * Started and stopped by the Drawer's own events: Base UI's data-swiping
 * on the popup while a finger has it, and the popup's transform transition
 * (transitionrun to transitionend) as it settles, a let-go or a size set.
 * Eased by the room's change after a render, as it was, the map started
 * as the page's effects ran, a render or two after the let-go, and on a
 * phone's CPU 220 ms after the sheet had landed (the median of five drops
 * from half to the pill, CPU 4x; the map's padding was half's all through
 * the drag). Each frame is set before MapLibre draws it: the next frame's
 * slide is asked for before the map's repaint, so the map's draw that
 * frame comes after the padding is set.
 *
 * A pick or a fit under way is left to the camera (its room, aimed again
 * at the sheet's room when it settles); the room at rest is set once the
 * sheet has settled. Whether a slide is under way, for the room's ease
 * (GlMapShell's follow) to leave it alone.
 */
export function useSheetSlide(map: GlMap | null, insetsRef: RefObject<MapInsets>): () => boolean {
  const active = useRef(false);
  useEffect(() => {
    if (!map) return;
    let sheet: SlidingSheet | null = null;
    let frame = 0;
    let swiping = false;
    let settling = false;
    let after = 0;
    let last = -1;
    // The map's foot, read once a slide starts, not every frame: it changes
    // only as the window does, and read each frame after the sheet's own
    // writes it forced a layout (the animation audit of 2026-11-23, M10).
    let bottom = 0;
    const step = () => {
      frame = 0;
      if (!sheet) return stop();
      const cover = Math.round(Math.min(sheet.most, Math.max(sheet.least, bottom - sheet.node.getBoundingClientRect().top)));
      if (cover !== last && cameraOf(map).slide({ ...padOf(insetsRef.current), bottom: cover })) last = cover;
      if (!swiping && !settling && --after < 0) return stop();
      frame = requestAnimationFrame(step);
      map.triggerRepaint();
    };
    const start = () => {
      if (!active.current) bottom = map.getContainer().getBoundingClientRect().bottom;
      active.current = true;
      if (!frame) frame = requestAnimationFrame(step);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = -1;
      if (!active.current) return;
      active.current = false;
      // At rest: the room the sheet settled at, exactly (or a pick under
      // way aimed again at it).
      cameraOf(map).room(padOf(insetsRef.current), "set", { duration: DRAWER_MS, easing: drawerEasing });
    };
    const swiped = () => {
      const now = !!sheet?.node.hasAttribute("data-swiping");
      if (now === swiping) return;
      swiping = now;
      after = LET_GO_FRAMES;
      if (now) start();
    };
    const ours = (e: TransitionEvent) => e.target === sheet?.node && e.propertyName === "transform";
    const run = (e: TransitionEvent) => {
      if (!ours(e)) return;
      settling = true;
      start();
    };
    const end = (e: TransitionEvent) => {
      if (!ours(e)) return;
      settling = false;
      after = 0;
    };
    const watch = new MutationObserver(swiped);
    const bind = (next: SlidingSheet | null) => {
      if (sheet?.node !== next?.node) {
        watch.disconnect();
        sheet?.node.removeEventListener("transitionrun", run);
        sheet?.node.removeEventListener("transitionend", end);
        sheet?.node.removeEventListener("transitioncancel", end);
        next?.node.addEventListener("transitionrun", run);
        next?.node.addEventListener("transitionend", end);
        next?.node.addEventListener("transitioncancel", end);
        if (next) watch.observe(next.node, { attributes: true, attributeFilter: ["data-swiping"] });
        settling = false;
      }
      sheet = next;
      if (!sheet) stop();
    };
    bind(useSlidingSheet.getState().sheet);
    const unsubscribe = useSlidingSheet.subscribe((s) => bind(s.sheet));
    return () => {
      unsubscribe();
      bind(null);
      if (frame) cancelAnimationFrame(frame);
      active.current = false;
    };
  }, [map, insetsRef]);
  return useCallback(() => active.current, []);
}
