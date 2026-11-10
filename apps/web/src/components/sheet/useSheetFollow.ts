import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "../../lib/motion";
import { DRAWER_MS } from "./insets";

/** The Drawer's settle, as MapPanel's popup class runs it: what follows
 *  the sheet -- the parts held in sight at its free edge, the map's
 *  buttons -- goes on the same curve and time. */
const DRAWER_EASE = `${DRAWER_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;

/** The parts held in sight at the sheet's free edge, written to directly:
 *  a bottom sheet's figures at its foot; a top sheet's head and body. */
export interface PinnedParts {
  head: HTMLElement | null;
  body: HTMLElement | null;
  foot: HTMLElement | null;
}

/** Where the map's buttons and its credits ride on the sheet's top
 *  (--sheet-cover, their `bottom` in index.css): a rule of their own, set
 *  on them alone. Set on <body>, an inherited property, every change of it
 *  restyled the whole page (177 to 260 ms of a phone's at 4x, 2026-10-28). */
let coverDeclaration: CSSStyleDeclaration | null = null;
function cover(px: number | null, ease: string) {
  if (!coverDeclaration) {
    const sheet = document.head.appendChild(document.createElement("style")).sheet!;
    sheet.insertRule("[data-map-controls], [data-map-food], .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right {}", 0);
    coverDeclaration = (sheet.cssRules[0] as CSSStyleRule).style;
  }
  if (px === null) {
    coverDeclaration.removeProperty("--sheet-cover");
    coverDeclaration.removeProperty("--sheet-cover-ease");
    return;
  }
  coverDeclaration.setProperty("--sheet-cover-ease", ease || "0s");
  coverDeclaration.setProperty("--sheet-cover", `${Math.round(px)}px`);
}

/** The parts held in sight, `off` px in from where the popup's free edge
 *  is laid out: a bottom sheet's figures up by it; a top sheet's head and
 *  body down by it. */
function pin(parts: PinnedParts, off: number, fromBottom: boolean, ease: string) {
  const px = Math.round(off * 100) / 100;
  const write = (el: HTMLElement | null, y: number, clip = "") => {
    if (!el) return;
    const transition = ease ? `transform ${ease}${clip ? `, clip-path ${ease}` : ""}` : "";
    const transform = Math.abs(y) < 0.25 ? "" : `translate3d(0, ${y}px, 0)`;
    // Written only where it changes: each write is a restyle.
    if (el.style.transition !== transition) el.style.transition = transition;
    if (el.style.transform !== transform) el.style.transform = transform;
    if (el.style.clipPath !== clip) el.style.clipPath = clip;
  };
  // The body cut off where the parts held in sight begin, so its rows are
  // never drawn under them: over a bottom sheet's figures, over a top
  // sheet's figures and grabber.
  const cut = px >= 0.25 ? `inset(0 0 ${px}px 0)` : "";
  if (fromBottom) {
    write(parts.foot, -px);
    write(parts.head, 0);
    write(parts.body, 0, parts.foot ? cut : "");
  } else {
    write(parts.foot, 0);
    write(parts.head, px);
    write(parts.body, px, cut);
  }
}

/** Where the Drawer has put its popup's snap point, px in from its edge:
 *  the offset it slides the popup by, as it writes it. */
const offsetOf = (popup: HTMLElement) => Math.abs(parseFloat(popup.style.getPropertyValue("--drawer-snap-point-offset")) || 0);

/**
 * What follows Base UI's Drawer as it moves, the one thing the stock sheet
 * does not do itself: the parts that stay in sight at its free edge while
 * the popup, laid out at its full height (`full`), slides (pin), and on a
 * phone's bottom sheet the map's buttons riding its top (cover). Started
 * from the Drawer's own write of its snap offset to the popup (watched),
 * on the Drawer's curve and time, so the two set off in the same frame:
 * started from the sheet's own state, they set off up to two frames ahead
 * of a popup the Drawer re-rendered later, the figures 45 points past the
 * sheet's edge. Under a finger (data-swiping), a frame at a time from the
 * popup's transform.
 */
export function useSheetFollow(
  popup: HTMLElement | null,
  parts: RefObject<PinnedParts>,
  {
    fromBottom,
    ride,
    full,
    mounted,
  }: {
    fromBottom: boolean;
    ride: boolean;
    full: number;
    /** What is mounted of the parts (their nodes), placed afresh as one comes. */
    mounted: unknown;
  },
) {
  const now = useRef({ fromBottom, ride, full, last: NaN });
  const place = useRef<(ease: string) => void>(() => {});
  // Placed at once: as the page opens, a turn of the layout, a part come
  // into the sheet (the route's figures as a route arrives, which eased
  // from its own place slid up from under the screen's edge).
  useLayoutEffect(() => {
    now.current = { fromBottom, ride, full, last: now.current.last };
    place.current = (ease) => {
      if (!popup) return;
      const at = offsetOf(popup);
      const { fromBottom: bottom, ride: rides, full: whole } = now.current;
      now.current.last = at;
      pin(parts.current, at, bottom, ease);
      cover(rides ? whole - at : null, ease);
    };
    place.current("");
  }, [popup, parts, fromBottom, ride, full, mounted]);
  useEffect(() => () => cover(null, ""), []);

  useEffect(() => {
    if (!popup) return;
    let frame = 0;
    let swiped = false;
    const step = () => {
      const { fromBottom: bottom, ride: rides, full: whole } = now.current;
      const t = getComputedStyle(popup).transform;
      const y = t && t !== "none" ? new DOMMatrix(t).m42 : 0;
      const at = Math.max(0, bottom ? y : -y);
      pin(parts.current, at, bottom, "");
      if (rides) cover(whole - at, "");
      frame = requestAnimationFrame(step);
    };
    const seen = new MutationObserver(() => {
      const swiping = popup.hasAttribute("data-swiping");
      if (swiping && !swiped) step();
      if (swiping) {
        swiped = true;
        return;
      }
      // At rest or let go: eased on to where the Drawer now puts it, from
      // the frame it does -- whether or not the snap point changed (a drag
      // let go short of the next one goes back).
      if (!swiped && offsetOf(popup) === now.current.last) return;
      cancelAnimationFrame(frame);
      swiped = false;
      // On the Drawer's curve when the popup eases (not before its first
      // measure, nor under Reduce Motion: then the popup jumps too).
      const eases = !prefersReducedMotion() && parseFloat(getComputedStyle(popup).transitionDuration) > 0;
      place.current(eases ? DRAWER_EASE : "");
    });
    seen.observe(popup, { attributes: true, attributeFilter: ["data-swiping", "style"] });
    return () => {
      seen.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [popup, parts]);
}
