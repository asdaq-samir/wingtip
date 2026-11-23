import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "cn";
import type { PanelState } from "../../lib/mapChrome";
import { prefersReducedMotion } from "../../lib/motion";
import { EDGE_ROOM } from "./insets";
import { FootRest, useFootBarHeight, useRestSize } from "./sheetMotion";

/** The foot's size told to what it holds, taken at rest. */
export function FootRestOf({ size, children }: { size: PanelState; children: ReactNode }) {
  return <FootRest.Provider value={useRestSize(size)}>{children}</FootRest.Provider>;
}

/** The pill's room under the grabber's 1 rem (sheet/insets' 4.25 rem): the
 *  bar's height at the pill, the figures alone, so the pill looks as the
 *  sheet's own face did. */
export const FOOT_BAR_PILL = "3.25rem";

/** Its height folded at the pill, in sight and holding its figures, else
 *  none: out of sight (the keyboard up, the route's field open), or in
 *  sight with its figures put away (a stop typed under a card, FlightFoot's
 *  figuresAway), it is too short for the pill, which shrank to the edge's
 *  room and hid the sheet's head (the r7 audit's W-L3). */
function foldedHeight(el: HTMLElement): number | undefined {
  const folded = el.dataset.at === "peek" && !el.inert && !!el.querySelector("[data-foot-strip]");
  return folded ? Math.round(el.offsetHeight) || undefined : undefined;
}

/**
 * FPL's foot on a phone's bottom sheet: the figures strip over the tab bar
 * (Brief, Nav Log, Routes, More), ONE fixed bar over the screen's foot,
 * outside the sliding Drawer -- a sibling of its popup in its viewport, as
 * iOS 26 puts a tab bar's bottom accessory over its tab bar -- so the sheet
 * slides behind it and nothing in it follows the sheet (the sheet-motion
 * audit of 2026-11-23, option B, the owner taking the recommendation).
 * Where it was held at the foot from inside the sliding popup, a CSS
 * formula against the popup's slide, script measures, keyframes at each
 * settle and React's state each kept a copy of where it was, and every
 * transition showed a frame where two disagreed: the strip led the sheet
 * over the map, jumped into the route, cut the tab bar out mid-slide.
 *
 * What it shows is the size the sheet is going to, the page's, which a
 * let-go sets from the Drawer's onSnapPointChange (SheetDrawer's
 * useSnapFirst) and a tap sets at once: at the pill the figures alone, the
 * pill's size, the tabs folded away, about 50 points of map; at half and
 * all the way up the thin strip on the tab bar, one stack. So it changes
 * once, as the finger lifts, never with the finger, and the sheet slides
 * behind what it will rest under: held until the slide had ended, the
 * tabs and the thin strip floated over the bare map as the sheet went
 * down behind them, then snapped to the pill (the owner's recording,
 * 2026-11-23). A short fade of what it holds as it changes; its ground
 * never fades, so the route behind it never shows through (the r6 UI
 * audit's M6). Folded, its height is the pill's (useFootBarHeight's
 * `pill`, sheet/insets' footPillPx), so at the pill the sheet stands
 * wholly behind it, its grabber alone over it. Opaque on
 * the sheet's own ground, with no fade or scrim over the content above
 * it: the held strip's fade (FADE_OVER) dimmed the Add a Stop row, its
 * pill and the toggle just over it (the owner, 2026-11-23: "the strip
 * fades the route buttons above it"). The page's end room and its scroll
 * padding, the bar's height (SheetScroller), let its last row scroll, and
 * a focused row stop, clear above it.
 *
 * Its ground takes no touch at any size, its buttons alone do: a drag on
 * it is the sheet's under it (the Drawer starts a swipe only where what is
 * under the finger is its popup), as Apple Maps' sheet moves from any
 * point that is not a control (the r6 UI audit's M2). At the pill a tap is
 * the pill's row's (SheetScroller's band), which raises it to half; from
 * half up a tap on its ground is swallowed, so none reaches a row hidden
 * under it. Its height is set on the viewport (--foot-bar) for the page's
 * end room (SheetScroller), on a resize only, never a frame at a time,
 * and kept for the map's room (useFootBarHeight). Out of sight at once,
 * no fade, under a card (before the card rises, so none slides up under
 * it; the r6 UI audit's M7), on Search's page (a page turn moves nothing)
 * and while the keyboard is up (MapPanel; `shown`).
 */
export function FootBar({ size, shown, children }: { size: PanelState; shown: boolean; children: ReactNode }) {
  const pill = size === "peek";
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = bar.current;
    const host = el?.parentElement;
    if (!el || !host || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(([entry]) => {
      const height = Math.round(entry?.borderBoxSize[0]?.blockSize ?? el.offsetHeight);
      host.style.setProperty("--foot-bar", `${height}px`);
      useFootBarHeight.setState((was) => ({ height, pill: foldedHeight(el) ?? was.pill }));
    });
    watch.observe(el);
    return () => {
      watch.disconnect();
      host.style.removeProperty("--foot-bar");
      useFootBarHeight.setState({ height: 0, pill: 0 });
    };
  }, []);
  // And as it comes into sight folded, which need not resize it (FPL's
  // page turned to at the pill).
  useLayoutEffect(() => {
    const height = bar.current && foldedHeight(bar.current);
    if (height) useFootBarHeight.setState({ pill: height });
  }, [pill, shown]);
  // From half up, a tap on its ground, which falls through to the popup,
  // goes no further: the row it lands on is hidden under the bar. Only
  // the click is stopped; the press still reaches the Drawer, for a drag.
  useEffect(() => {
    const el = bar.current;
    const host = el?.parentElement;
    if (!el || !host || pill || !shown) return;
    const guard = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || el.contains(event.target)) return;
      const box = el.getBoundingClientRect();
      if (event.clientY < box.top || event.clientY > box.bottom) return;
      event.preventDefault();
      event.stopPropagation();
    };
    host.addEventListener("click", guard, true);
    return () => host.removeEventListener("click", guard, true);
  }, [pill, shown]);
  // A short fade of what it holds as it changes, on the compositor; none
  // the first time. Not of the bar itself, whose ground would let the
  // route through.
  const face = useRef<HTMLDivElement>(null);
  const was = useRef(size);
  useEffect(() => {
    const el = face.current;
    if (was.current === size || !el) return;
    was.current = size;
    if (prefersReducedMotion() || typeof el.animate !== "function") return;
    el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
  }, [size]);
  return (
    <div
      ref={bar}
      data-testid="foot-bar"
      data-foot-bar=""
      data-at={size}
      inert={!shown}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-(--sheet) px-4 text-foreground print:hidden",
        !shown && "invisible",
        pill ? "[&_[data-pill-hides]]:hidden" : "[&_:is(button,a,[role=button])]:pointer-events-auto",
      )}
      style={{ paddingBottom: EDGE_ROOM }}
    >
      <div ref={face}>
        <FootRest.Provider value={size}>{children}</FootRest.Provider>
      </div>
    </div>
  );
}
