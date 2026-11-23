import { useLayoutEffect, useRef } from "react";
import type { PanelState } from "../../lib/mapChrome";
import { prefersReducedMotion } from "../../lib/motion";
import { MOTION } from "../../lib/tokens";

/**
 * The side panel (from `md` up, MapPanel) put in and out with its edge
 * gliding, on the Drawer's time and curve, as the map's room and its
 * corner controls ease beside it: a tap on its grabber or Escape snapped
 * it between its head and the window's height in one frame, the one thing
 * on the screen that did not move (the apple-design audit of 2026-11-23,
 * H2). Its layout changes at once, as before -- its head alone, or the
 * whole panel -- and only what is drawn eases, by a clip, which the
 * compositor draws: out, the panel is uncovered from its head down; in,
 * a copy of its ground, the look's own classes, is drawn where it was and
 * closed up to the head. Nothing under Reduce Motion: a panel beside the
 * map, not a sheet that slides.
 */
export function useSideGlide(panel: HTMLElement | null, size: PanelState, radius: number) {
  const was = useRef<{ size: PanelState; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!panel) return;
    const height = panel.offsetHeight;
    const before = was.current;
    was.current = { size, height };
    if (!before || before.size === size || typeof panel.animate !== "function" || prefersReducedMotion()) return;
    // Half and all the way up are one box beside the map.
    if (Math.abs(height - before.height) < 1) return;
    const timing = { duration: MOTION.drawer * 1000, easing: `cubic-bezier(${MOTION.drawerEase.join(",")})` };
    const clip = (cut: number) => `inset(0 0 ${Math.max(0, cut)}px 0 round ${radius}px)`;
    if (height > before.height) {
      panel.animate([{ clipPath: clip(height - before.height) }, { clipPath: clip(0) }], timing);
      return;
    }
    // Put in: its ground drawn to its old height under the head, closing up.
    const ground = document.createElement("div");
    ground.setAttribute("aria-hidden", "true");
    ground.dataset.sideGlide = "";
    ground.className = panel.className;
    ground.style.cssText = `position:fixed;pointer-events:none;top:${panel.getBoundingClientRect().top}px;height:${before.height}px;border-radius:${radius}px`;
    panel.before(ground);
    ground
      .animate([{ clipPath: clip(0) }, { clipPath: clip(before.height - height) }], timing)
      .finished.catch(() => {})
      .finally(() => ground.remove());
  }, [panel, size, radius]);
}
