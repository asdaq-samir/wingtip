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
 * whole panel -- and only what is drawn eases. Out, the panel is uncovered
 * from its head down, by a clip. In, a copy of its ground, the look's own
 * classes, is drawn where it was inside a box of its old height that
 * clips it, and the box slides up while the copy slides down as much,
 * the copy still and the box's foot closing up to the head: transforms
 * alone, which WebKit composites, where a clip-path animation is drawn on
 * Safari's main thread, the whole frosted panel painted again each frame
 * of the Drawer's 450 ms on every iPad. Nothing under Reduce Motion: a
 * panel beside the map, not a sheet that slides.
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
    // from its first frame: the clip
    // drawn now, read before the glide under way is let go.
    const going = panel.getAnimations().filter((a) => a.id === GLIDE);
    const shut0 = panel.parentElement?.querySelector<HTMLElement>(":scope > [data-side-glide]");
    const drawnCut = (el: HTMLElement, full: number) => {
      const cut = /inset\(0(?:px)? 0(?:px)? ([\d.]+)px/.exec(getComputedStyle(el).clipPath)?.[1];
      return cut === undefined ? null : full - parseFloat(cut);
    };
    // How much of the panel is in sight now, where a glide is under way:
    // the clip drawn going out, the closing box's foot coming in.
    const seen = going.length
      ? drawnCut(panel, height)
      : shut0
        ? shut0.getBoundingClientRect().bottom - panel.getBoundingClientRect().top
        : null;
    for (const a of going) a.cancel();
    shut0?.remove();
    if (height > before.height) {
      const from = seen ?? before.height;
      panel.animate([{ clipPath: clip(height - from) }, { clipPath: clip(0) }], { ...glide, id: GLIDE });
      return;
    }
    // Put in: its ground drawn to its old height under the head, closing
    // up, over the panel's own box: its left and width as well as its top,
    // and its data-* (what its look reads), so no offset container moves it.
    // Not its slot: a copy that said it was the map's panel was a second
    // one to what looks for the panel (use-shortcuts' search, backNavigation,
    // the browser specs' "resolved to 2 elements" while it closed up).
    const from = seen ?? before.height;
    const box = panel.getBoundingClientRect();
    const shut = document.createElement("div");
    shut.dataset.sideGlide = "";
    shut.setAttribute("aria-hidden", "true");
    shut.style.cssText = `position:fixed;pointer-events:none;overflow:clip;top:${box.top}px;left:${box.left}px;width:${box.width}px;height:${from}px;border-radius:${radius}px`;
    const ground = document.createElement("div");
    for (const { name, value } of panel.attributes)
      if (name.startsWith("data-") && name !== "data-testid" && name !== "data-slot") ground.setAttribute(name, value);
    ground.className = panel.className;
    ground.style.cssText = `position:absolute;inset:0;border-radius:${radius}px`;
    shut.append(ground);
    panel.before(shut);
    const rise = Math.max(0, from - height);
    const done = shut.animate([{ transform: "translateY(0)" }, { transform: `translateY(${-rise}px)` }], glide).finished;
    ground.animate([{ transform: "translateY(0)" }, { transform: `translateY(${rise}px)` }], glide);
    done.catch(() => {}).finally(() => shut.remove());
  }, [panel, size, radius]);
}
