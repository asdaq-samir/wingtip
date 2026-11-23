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
 * What it shows changes only once the sheet has come to rest
 * (useRestSize): at the pill the figures alone, the pill's size, the tabs
 * folded away, about 50 points of map; at half and all the way up the thin
 * strip on the tab bar, one stack. A short fade as it changes, nothing
 * eased with the finger. Opaque on the sheet's own ground, with no fade
 * or scrim over the content above it: the held strip's fade (FADE_OVER)
 * dimmed the Add a Stop row, its pill and the toggle just over it (the
 * owner, 2026-11-23: "the strip fades the route buttons above it"). The
 * page's end room, the bar's height (SheetScroller), lets its last row
 * scroll clear above it.
 *
 * At the pill it takes no touch: a drag on it is the sheet's under it
 * (the Drawer starts a swipe only on its own popup), which raises it, and
 * a tap the pill's row's (SheetScroller's band), which raises it to half.
 * From half up it takes its own taps, so none reaches a row under it.
 * Its height is set on the viewport (--foot-bar) for the page's end room
 * (SheetScroller), on a resize only, never a frame at a time, and kept
 * for the map's room (useFootBarHeight). Out of sight, and out of the
 * way, under a card or on Search's page (`shown`).
 */
export function FootBar({ size, shown, children }: { size: PanelState; shown: boolean; children: ReactNode }) {
  const rest = useRestSize(size);
  const pill = rest === "peek";
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = bar.current;
    const host = el?.parentElement;
    if (!el || !host || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(([entry]) => {
      const height = Math.round(entry?.borderBoxSize[0]?.blockSize ?? el.offsetHeight);
      host.style.setProperty("--foot-bar", `${height}px`);
      useFootBarHeight.setState({ height });
    });
    watch.observe(el);
    return () => {
      watch.disconnect();
      host.style.removeProperty("--foot-bar");
      useFootBarHeight.setState({ height: 0 });
    };
  }, []);
  // A short fade as it changes at rest, on the compositor; none the first time.
  const was = useRef(rest);
  useEffect(() => {
    const el = bar.current;
    if (was.current === rest || !el) return;
    was.current = rest;
    if (prefersReducedMotion() || typeof el.animate !== "function") return;
    el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
  }, [rest]);
  return (
    <div
      ref={bar}
      data-testid="foot-bar"
      data-at={rest}
      inert={!shown}
      className={cn(
        "absolute inset-x-0 bottom-0 z-10 bg-(--sheet) px-4 text-foreground print:hidden",
        "transition-[opacity,visibility] duration-(--motion-drawer) ease-(--motion-drawer-ease) motion-reduce:transition-none",
        !shown && "invisible opacity-0",
        pill ? "pointer-events-none [&_[data-pill-hides]]:hidden" : "pointer-events-auto",
      )}
      style={{ paddingBottom: EDGE_ROOM }}
    >
      <FootRest.Provider value={rest}>{children}</FootRest.Provider>
    </div>
  );
}
