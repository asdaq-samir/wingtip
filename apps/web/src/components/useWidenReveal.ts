import { useCallback } from "react";
import { prefersReducedMotion, timing } from "../lib/motion";

/**
 * A capsule that widens (the mic into its listening pill, MapControls)
 * drawn at its new width at once and uncovered from the side that stays
 * put, by a clip that eases open on the sheet's time and curve. Its width
 * was eased through a grid column once, which laid the glass out again
 * and blurred a backdrop of a new size every frame of the 300 ms (the
 * animation audit of 2026-11-23, M3); a clip is drawn by the compositor.
 * It grows to the left, the mic at its right staying where it was, so
 * its new part is uncovered from the right. Nothing under Reduce Motion:
 * the capsule is simply wider.
 */
export function useWidenReveal<T extends HTMLElement>() {
  // A callback ref, so a capsule drawn later (the mic comes and goes with
  // the ATC Copilot) is watched from when it is on the page.
  return useCallback((node: T | null) => {
    if (!node || typeof ResizeObserver === "undefined" || typeof node.animate !== "function") return;
    let was = node.offsetWidth;
    const seen = new ResizeObserver(() => {
      const now = node.offsetWidth;
      const grown = now - was;
      was = now;
      if (grown < 1 || prefersReducedMotion()) return;
      // A pill's ends round however wide (a radius larger than the box is
      // scaled down to fit), so the clip's edge is the capsule's own.
      const hidden = `inset(0 0 0 ${grown}px round 9999px)`;
      // No fill: at rest there is no clip, so the capsule's shadow is whole.
      node.animate([{ clipPath: hidden }, { clipPath: "inset(0 round 9999px)" }], timing("sheet"));
    });
    seen.observe(node);
    return () => seen.disconnect();
  }, []);
}
