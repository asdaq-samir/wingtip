import { useLayoutEffect, type RefObject } from "react";
import { useFootBarHeight, useSheetRestOffset } from "../../../components/sheet/sheetMotion";

/** The toggle's row under the pills (RouteEditor, h-11) and eight clear of the bar. */
const UNDER_PILLS_PX = 44 + 8;
/** Two of the pills' 36-point lines at the least, so a short sheet still shows the route. */
const LEAST_PX = 72;

/**
 * The route's field (RouteEditor, the box's other face) kept above FPL's
 * foot bar wherever the phone's sheet rests: a long route's pills scroll
 * inside the box, its last row, the Add Stops pill and the toggle back,
 * held in sight above the bar, and the sheet never moves by itself (the
 * owner, 2026-11-25: "Yes" to the scroll inside the box). All the way up
 * the sheet's body scrolls (SheetScroller's end room keeps its last row
 * clear), so no cap there.
 *
 * The room is --route-room on the field, read by RouteBox's wrapped pills,
 * measured where the sheet will rest, not where it is (useSheetRestOffset),
 * so a slide or a finger's drag changes nothing until a new rest; the bar's
 * height is useFootBarHeight's. Only in the box's own place (on); under a card the
 * card has the screen.
 */
export function useFieldRoom(field: RefObject<HTMLElement | null>, on: boolean) {
  const rest = useSheetRestOffset();
  const bar = useFootBarHeight((s) => s.height);
  useLayoutEffect(() => {
    const el = field.current;
    const popup = el?.closest<HTMLElement>('[data-slot="map-panel"]');
    if (!on || !el || !popup || typeof ResizeObserver === "undefined") return;
    let room = "";
    const check = () => {
      const pills = el.querySelector<HTMLElement>('[data-testid="route-slide"]');
      // The bar stands on the foot of the popup's viewport (SheetDrawer).
      const foot = popup.parentElement?.getBoundingClientRect().bottom;
      let next = "";
      if (bar && pills && foot && rest > 1) {
        // The popup's own top unslid (offsetTop: the status bar's room and
        // 8 over it, SheetDrawer), the rest under it, the pills' place in it.
        const top = popup.offsetTop + rest + pills.getBoundingClientRect().top - popup.getBoundingClientRect().top;
        const fits = Math.round(foot - bar - UNDER_PILLS_PX - top);
        next = `${Math.max(LEAST_PX, fits)}px`;
      }
      if (next === room) return;
      room = next;
      if (next) el.style.setProperty("--route-room", next);
      else el.style.removeProperty("--route-room");
    };
    // As it opens, as its lines grow, and (the effect run again) at a new rest.
    const grows = new ResizeObserver(check);
    grows.observe(el);
    return () => {
      grows.disconnect();
      el.style.removeProperty("--route-room");
    };
  }, [field, on, rest, bar]);
}
