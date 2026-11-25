import { useLayoutEffect, type RefObject } from "react";
import { panelNow } from "../../plan";

/** The toggle's row under the pills (RouteEditor, h-11) and eight clear of the bar. */
const UNDER_PILLS_PX = 44 + 8;
/** Two of the pills' 36-point lines at the least, so a short sheet still shows the route. */
const LEAST_PX = 72;

/**
 * The route's field (RouteEditor, the box's other face) kept above FPL's
 * foot bar wherever the phone's sheet rests: a long route's pills scroll
 * inside the box, its last row, the Add Stops pill and the toggle back,
 * held in sight above the bar. At half a long route's lines ran down
 * behind the bar with that row (the owner's iPhone, 2026-11-23 and again
 * 2026-11-25), where the sheet had risen to full by itself once a time the
 * field opened and a pilot who lowered it again could not reach the toggle;
 * the owner chose the scroll inside the box (2026-11-25: "Yes"), and the
 * sheet no longer moves by itself. All the way up the sheet's body scrolls
 * (SheetScroller's end room keeps its last row clear), so no cap there.
 *
 * The room is --route-room on the field, read by RouteBox's wrapped pills,
 * measured where the sheet will rest, not where it is: its snap offset
 * (Base UI's --drawer-snap-point-offset on the popup) plus the field's
 * place in it, so a slide or a finger's drag changes nothing until a new
 * rest. Only in the box's own place (on); under a card the card has the
 * screen.
 */
export function useFieldRoom(field: RefObject<HTMLElement | null>, on: boolean) {
  useLayoutEffect(() => {
    const el = field.current;
    const popup = el?.closest<HTMLElement>('[data-slot="map-panel"]');
    if (!on || !el || !popup || typeof ResizeObserver === "undefined") return;
    let room = "";
    const check = () => {
      // Only under a phone's foot bar (sheet/FootBar), laid out at the
      // viewport's foot even while the keyboard hides it.
      const bar = document.querySelector<HTMLElement>("[data-foot-bar]");
      const pills = el.querySelector<HTMLElement>('[data-testid="route-slide"]');
      let next = "";
      if (bar && pills && panelNow.current !== "full") {
        const rest = parseFloat(popup.style.getPropertyValue("--drawer-snap-point-offset")) || 0;
        const top = rest + pills.getBoundingClientRect().top - popup.getBoundingClientRect().top;
        const fits = Math.round(bar.getBoundingClientRect().top - UNDER_PILLS_PX - top);
        next = `${Math.max(LEAST_PX, fits)}px`;
      }
      if (next === room) return;
      room = next;
      if (next) el.style.setProperty("--route-room", next);
      else el.style.removeProperty("--route-room");
    };
    // As it opens, as its lines grow, and as the sheet comes to a new rest.
    const grows = new ResizeObserver(check);
    grows.observe(el);
    const rests = new MutationObserver(check);
    rests.observe(popup, { attributes: true, attributeFilter: ["style"] });
    return () => {
      grows.disconnect();
      rests.disconnect();
      el.style.removeProperty("--route-room");
    };
  }, [field, on]);
}
