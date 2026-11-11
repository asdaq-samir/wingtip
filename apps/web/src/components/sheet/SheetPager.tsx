import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "../../lib/motion";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "../ui/carousel";

/**
 * The sheet's two pages side by side, Search and FPL (the owner,
 * 2026-11-11, docs/design/rules.md "One search"): the first page's body is
 * the panel's own (its children), under the one search; the second's is
 * `second`, under the route's row.
 */
export interface SheetPages {
  /** The page up: 0 the search's, 1 the plan's. */
  at: number;
  /** A page picked, by a swipe or its bar of the grabber. */
  go: (page: number) => void;
  /** Each page's name, for its bar of the grabber and a screen reader. */
  names: readonly [string, string];
  /** The second page's body: the plan. */
  second: ReactNode;
}

/**
 * The pages, the app's stock carousel (shadcn's Carousel on Embla, as
 * CardPictures' row is): a sideways swipe moves a page, an up or down one
 * is the sheet's or the page's own scroller's (data-base-ui-swipe-ignore
 * "x", the one scrolling rule). Each page is its own scroller, so each
 * keeps its place. Its viewport is clipped, not hidden, so a field focused
 * on the page out of sight never scrolls it sideways under Embla.
 */
/**
 * Whether a drag that starts at `target` is the pager's: not where it
 * starts in a row of the page's own that moves sideways -- a row that
 * scrolls sideways (Nearest, Favorites), a carousel of its own (Recents'
 * cards), or what keeps its drags (data-base-ui-swipe-ignore: the altitude
 * slider, the sortable rows). The owner, 2026-11-11: "I am not able to
 * scroll the nearest because it swipes to the fpl". Embla's own hook for
 * it (`watchDrag` as a function), checked up to the pager's root.
 */
function pagersDrag(target: EventTarget | null, root: HTMLElement): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el.getAttribute("aria-roledescription") === "carousel") return false;
    const ignore = el.getAttribute("data-base-ui-swipe-ignore");
    if (ignore === "" || ignore === "x") return false;
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1) {
      const x = getComputedStyle(el).overflowX;
      if (x === "auto" || x === "scroll") return false;
    }
  }
  return true;
}

export function SheetPager({ at, go, drag, pages }: { at: number; go: (page: number) => void; drag: boolean; pages: ReactNode[] }) {
  const [api, setApi] = useState<CarouselApi>();
  // The page it opens on, once: a page picked later is scrolled to (below),
  // where a new start would build the pager again and jump.
  const [start] = useState(at);
  const settled = useEffectEvent((page: number) => {
    if (page !== at) go(page);
  });
  useEffect(() => {
    if (!api) return;
    const picked = () => settled(api.selectedScrollSnap());
    api.on("select", picked);
    return () => {
      api.off("select", picked);
    };
  }, [api]);
  // A page picked elsewhere (its bar of the grabber, a route made, a link): the pager
  // follows, at once under Reduce Motion.
  useEffect(() => {
    if (api && api.selectedScrollSnap() !== at) api.scrollTo(at, prefersReducedMotion());
  }, [api, at]);
  return (
    <Carousel
      opts={{ startIndex: start, watchDrag: drag ? (embla, event) => pagersDrag(event.target, embla.rootNode()) : false }}
      setApi={setApi}
      // The arrow keys are the field's and the lists' here, not the pager's:
      // the split grabber (SheetGrabber's Tabs) steps the pages from the keyboard.
      onKeyDownCapture={undefined}
      aria-label="Sheet pages"
      data-base-ui-swipe-ignore="x"
      data-testid="sheet-pager"
      data-page={at}
      className="flex min-h-0 flex-1 flex-col print:block"
    >
      <CarouselContent wrapperClassName="flex min-h-0 flex-1 flex-col overflow-clip print:overflow-visible" className="ml-0 min-h-0 flex-1">
        {pages.map((page, i) => (
          <CarouselItem key={i} className="flex min-h-0 flex-col pl-0" data-sheet-page={i} data-shown={i === at || undefined}>
            {page}
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
