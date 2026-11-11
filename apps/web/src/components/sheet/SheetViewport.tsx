import { useEffect, useId, useRef, useState, type ComponentProps, type HTMLAttributes, type TouchEvent as ReactTouchEvent } from "react";
import { Drawer } from "@base-ui/react/drawer";

const HANDLERS = { touchstart: "onTouchStart", touchend: "onTouchEnd", touchcancel: "onTouchCancel" } as const;

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
 * A sheet's viewport (the stock Drawer's: the map's sheet's and each card's
 * nested drawer's, CardStack), and the touches on content drawn from
 * outside its React tree handed to it.
 *
 * A card's content is drawn where its caller is in React's tree, so it
 * reads its caller's providers, and put on the page in its drawer's
 * scroller by a portal (useCardFrame). React gives a portal's events to its
 * React parents, not to the page's, so a card opened from the map's
 * buttons or from the chart -- the Map settings, a route leg, a fix, an
 * airplane's profile -- never reached the Drawer's touch handlers on its
 * viewport: at half a drag up on it did not raise the sheet, and all the
 * way up a drag down from its top did not lower it (card-scroll.spec; the
 * one scrolling rule, the owner 2026-11-10). A touch on the page inside
 * this viewport that its own handlers did not see is given to them once
 * React is done with it, with its own target, so the Drawer arbitrates it
 * with the card's scroller as it does any other; its moves the Drawer
 * reads from the page itself. Each viewport marks the touches it saw with
 * its own key: a card's content, drawn in the sheet's React tree, is seen
 * by the sheet's handlers (which leave it, a nested drawer being open) and
 * still handed to its card's.
 * The handlers are the ones Base UI gives the viewport's element: its
 * documented `render` function receives them, the Drawer's own merged
 * with this one's, and draws the same <div> with them.
 *
 * An explicit forward, the third way the speed brief allowed (2026-11-10):
 * Base UI 1.9's Drawer has no prop for touches from a React portal drawn
 * into its viewport -- a swipe area (Drawer.SwipeArea) only opens a closed
 * drawer, and data-base-ui-swipe-ignore only takes touches away -- and
 * drawing the cards in the Drawer's own tree would cost them their callers'
 * providers (the map's, a card's close). No Base UI issue for it was
 * found (a web search, 2026-11-10); one is to be filed at
 * github.com/mui/base-ui/issues, and this goes once the Drawer takes them. It reads nothing of React's own: it
 * stood on the element's internal props key (__reactProps$…), which a
 * React update could rename.
 */
export function SheetViewport(props: ComponentProps<typeof Drawer.Viewport>) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  // Set on a touch this viewport's own handlers have been given.
  const key = `__sheetSaw${useId()}`;
  const seen = (event: ReactTouchEvent) => {
    (event.nativeEvent as unknown as Record<string, boolean>)[key] = true;
  };
  // The touch handlers Base UI gave the viewport at its last render.
  const given = useRef<HTMLAttributes<HTMLDivElement>>({});
  useEffect(() => {
    if (!viewport) return;
    const doc = viewport.ownerDocument;
    const hand = (event: TouchEvent) => {
      const marks = event as unknown as Record<string, boolean>;
      if (marks[key]) return;
      const at = event.target;
      if (!(at instanceof Element) || !viewport.contains(at)) return;
      const handler = given.current[HANDLERS[event.type as keyof typeof HANDLERS]] as ((event: unknown) => void) | undefined;
      handler?.(synthetic(event, viewport));
    };
    const types = Object.keys(HANDLERS);
    for (const type of types) doc.addEventListener(type, hand as EventListener, { passive: true });
    return () => {
      for (const type of types) doc.removeEventListener(type, hand as EventListener);
    };
  }, [viewport, key]);
  return (
    <Drawer.Viewport
      {...props}
      ref={setViewport}
      onTouchStart={seen}
      onTouchEnd={seen}
      onTouchCancel={seen}
      render={(own) => {
        given.current = own;
        return <div {...own} />;
      }}
    />
  );
}
