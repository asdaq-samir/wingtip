import { useEffect, useState, type ComponentProps, type TouchEvent as ReactTouchEvent } from "react";
import { Drawer } from "@base-ui/react/drawer";

/** Set on a touch the viewport's own handlers have been given. */
const SEEN = "__sheetSaw";
const HANDLERS = { touchstart: "onTouchStart", touchend: "onTouchEnd", touchcancel: "onTouchCancel" } as const;

const seen = (event: ReactTouchEvent) => {
  (event.nativeEvent as unknown as Record<string, boolean>)[SEEN] = true;
};

/** A touch as React hands it to a handler, from the browser's own. */
function synthetic(event: TouchEvent, viewport: HTMLElement) {
  return {
    nativeEvent: event,
    type: event.type,
    target: event.target,
    currentTarget: viewport,
    touches: event.touches,
    changedTouches: event.changedTouches,
    targetTouches: event.targetTouches,
    timeStamp: event.timeStamp,
    defaultPrevented: event.defaultPrevented,
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => {},
    isDefaultPrevented: () => event.defaultPrevented,
    isPropagationStopped: () => false,
    persist: () => {},
  };
}

/**
 * The phone's sheet's viewport (the stock Drawer's), and the touches on a
 * card drawn from outside the sheet handed to it.
 *
 * A SheetCard is drawn where its caller is in React's tree, so it reads its
 * caller's providers, and put on the page in the sheet's body by a portal
 * (SheetCard). React gives a portal's events to its React parents, not to
 * the page's, so a card opened from the map's buttons or from the chart --
 * the Map settings, a route leg, a fix, an airplane's profile -- never
 * reached the Drawer's touch handlers on this viewport: at half a drag up
 * on it did not raise the sheet, and all the way up a drag down from its
 * top did not lower it (card-scroll.spec; the one scrolling rule, the
 * owner 2026-11-10). A touch in the sheet's cards that the viewport's own
 * handlers did not see is given to them once React is done with it, with
 * its own target, so the Drawer arbitrates it with the card's scroller as
 * it does any other; its moves the Drawer reads from the page itself.
 * The handlers are read from the viewport's element as React keeps them
 * (its props), the Drawer's own merged with this one's.
 */
export function SheetViewport(props: ComponentProps<typeof Drawer.Viewport>) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!viewport) return;
    const doc = viewport.ownerDocument;
    const hand = (event: TouchEvent) => {
      const marks = event as unknown as Record<string, boolean>;
      if (marks[SEEN]) return;
      const at = event.target;
      if (!(at instanceof Element) || !viewport.contains(at) || !at.closest("[data-sheet-cards]")) return;
      const key = Object.keys(viewport).find((k) => k.startsWith("__reactProps$"));
      const own = key ? (viewport as unknown as Record<string, Record<string, unknown>>)[key] : undefined;
      const handler = own?.[HANDLERS[event.type as keyof typeof HANDLERS]];
      if (typeof handler === "function") handler(synthetic(event, viewport));
    };
    const types = Object.keys(HANDLERS);
    for (const type of types) doc.addEventListener(type, hand as EventListener, { passive: true });
    return () => {
      for (const type of types) doc.removeEventListener(type, hand as EventListener);
    };
  }, [viewport]);
  return <Drawer.Viewport {...props} ref={setViewport} onTouchStart={seen} onTouchEnd={seen} onTouchCancel={seen} />;
}
