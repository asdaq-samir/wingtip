import { useLayoutEffect, useRef } from "react";
import type { PanelState } from "../../lib/mapChrome";
import { prefersReducedMotion, timing } from "../../lib/motion";

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
/** The panel's own glide, told from any other animation on it. */
const GLIDE = "side-glide";

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
    const glide = timing("drawer");
    const clip = (cut: number) => `inset(0 0 ${Math.max(0, cut)}px 0 round ${radius}px)`;
    // A second tap part way through goes on from where the glide is, not
    // from its first frame (the r5-ui audit's L2, 2026-11-23): the clip
    // drawn now, read before the glide under way is let go.
    const going = panel.getAnimations().filter((a) => a.id === GLIDE);
    const ground0 = panel.parentElement?.querySelector<HTMLElement>(":scope > [data-side-glide]");
    const drawnCut = (el: HTMLElement | null | undefined, full: number) => {
      const cut = el ? /inset\(0(?:px)? 0(?:px)? ([\d.]+)px/.exec(getComputedStyle(el).clipPath)?.[1] : undefined;
      return cut === undefined ? null : full - parseFloat(cut);
    };
    // How much of the panel is in sight now, where a glide is under way.
    const seen = going.length ? drawnCut(panel, height) : ground0 ? drawnCut(ground0, ground0.offsetHeight) : null;
    for (const a of going) a.cancel();
    ground0?.remove();
    if (height > before.height) {
      const from = seen ?? before.height;
      panel.animate([{ clipPath: clip(height - from) }, { clipPath: clip(0) }], { ...glide, id: GLIDE });
      return;
    }
    // Put in: its ground drawn to its old height under the head, closing
    // up, over the panel's own box: its left and width as well as its top,
    // and its data-* (what its look reads), so no offset container moves it.
    const from = seen ?? before.height;
    const box = panel.getBoundingClientRect();
    const ground = document.createElement("div");
    for (const { name, value } of panel.attributes)
      if (name.startsWith("data-") && name !== "data-testid") ground.setAttribute(name, value);
    ground.setAttribute("aria-hidden", "true");
    ground.dataset.sideGlide = "";
    ground.className = panel.className;
    ground.style.cssText = `position:fixed;pointer-events:none;top:${box.top}px;left:${box.left}px;width:${box.width}px;height:${from}px;border-radius:${radius}px`;
    panel.before(ground);
    ground
      .animate([{ clipPath: clip(0) }, { clipPath: clip(from - height) }], glide)
      .finished.catch(() => {})
      .finally(() => ground.remove());
  }, [panel, size, radius]);
}
