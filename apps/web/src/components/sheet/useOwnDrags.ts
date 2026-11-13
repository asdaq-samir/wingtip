import { useEffect } from "react";
import type { CarouselApi } from "../ui/carousel";

/**
 * A drag of a page's own in the sheet's pager (React Aria's drag and drop:
 * FPL's list, RouteGrid) let begin. Embla cancels every native drag that
 * reaches its root (a dragstart's preventDefault, for a picture or a link
 * dragged under a swipe), which comes before React's own listener at the
 * page's root, so a row's drag never started (stops-reorder.spec,
 * 2026-11-13: the dragstart cancelled, no drop). For what is made
 * draggable, the event's preventDefault is passed over from its page to
 * just past Embla's root, and is the event's own again from there: React
 * Aria's still counts.
 */
export function useOwnDrags(api: CarouselApi | undefined) {
  useEffect(() => {
    if (!api) return;
    const above = api.rootNode().parentElement;
    const own = (event: DragEvent) => {
      if (event.target instanceof Element && event.target.closest('[draggable="true"]')) event.preventDefault = () => undefined;
    };
    const after = (event: DragEvent) => {
      delete (event as { preventDefault?: unknown }).preventDefault;
    };
    const slides = api.slideNodes();
    for (const slide of slides) slide.addEventListener("dragstart", own);
    above?.addEventListener("dragstart", after);
    return () => {
      for (const slide of slides) slide.removeEventListener("dragstart", own);
      above?.removeEventListener("dragstart", after);
    };
  }, [api]);
}
