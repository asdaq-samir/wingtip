import { useEffect, useEffectEvent, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { prefersReducedMotion } from "../../lib/motion";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "../ui/carousel";
import { setPageHeading } from "./pageHeading";
import { useOwnDrags } from "./useOwnDrags";

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

/** Where a sideways list stands: at its first item (`start`) or its last
 *  (`end`). */
interface Ends {
  start: () => boolean;
  end: () => boolean;
}

/** The sideways list under `target`, up to the pager's root, and how to
 *  read its ends: a row that scrolls itself (Nearest, Favorites) by its
 *  scroll, and a carousel of its own (Recents' cards, any Embla row) by
 *  where its first and last slides sit in its viewport -- the same for
 *  every list, either way (the owner, 2026-11-11: "Ending scroll should
 *  swipe applies to all the lists and both directions"). None where the
 *  touch starts elsewhere. */
function sidewaysList(target: EventTarget | null, root: HTMLElement): Ends | null {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el.getAttribute("aria-roledescription") === "carousel") {
      const viewport = [...el.children].find((c) => getComputedStyle(c).overflowX !== "visible") ?? el.firstElementChild;
      const track = viewport?.firstElementChild;
      if (!viewport || !track?.firstElementChild || !track.lastElementChild) return null;
      const box = () => viewport.getBoundingClientRect();
      return {
        start: () => track.firstElementChild!.getBoundingClientRect().left >= box().left - 1,
        end: () => track.lastElementChild!.getBoundingClientRect().right <= box().right + 1,
      };
    }
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1) {
      const x = getComputedStyle(el).overflowX;
      if (x === "auto" || x === "scroll") {
        const row = el;
        return { start: () => row.scrollLeft <= 0, end: () => row.scrollLeft + row.clientWidth >= row.scrollWidth - 1 };
      }
    }
  }
  return null;
}

/** How far past a row's end a finger pulls on before the page turns: a
 *  deliberate pull, not the row's own bounce. */
const PULL_PAST_END = 48;

export function SheetPager({
  at,
  go,
  drag,
  pages,
}: {
  at: number;
  go: (page: number) => void;
  drag: boolean;
  /** The pages, given the one Embla has selected: the one in sight is
   *  live, the other inert. */
  pages: (shown: number) => ReactNode[];
}) {
  const [api, setApi] = useState<CarouselApi>();
  // The page in sight is Embla's own selected snap, read at each of its
  // `select` and `reInit` events, never the app's page: what is live and
  // what is inert (SheetParts) can then never disagree with what is shown,
  // whatever builds Embla again or turns its page (the sheet audit,
  // 2026-11-12: the page in sight inert, nothing on it tappable). Before
  // Embla is up, the page it opens on.
  const [shown, setShown] = useState(at);
  useEffect(() => {
    if (!api) return;
    const read = () => setShown(api.selectedScrollSnap());
    read();
    api.on("select", read);
    api.on("reInit", read);
    return () => {
      api.off("select", read);
      api.off("reInit", read);
    };
  }, [api]);
  // Whether a drag is the pager's now, read when one starts: the options
  // stay the same object, as any change in them builds Embla again (the
  // React hook's reInit), which put it back on its first page with no
  // `select` -- a card opened (`drag` off) and closed left the page in sight
  // and the app's page out of step, the one in sight inert (the sheet
  // audit, 2026-11-12: Fly Here from a search, a card from Search over a
  // route).
  const dragNow = useRef(drag);
  useEffect(() => {
    dragNow.current = drag;
  }, [drag]);
  // The page it opens on, once: a page picked later is scrolled to (below),
  // where a new start would build the pager again and jump.
  const [opts] = useState<ComponentProps<typeof Carousel>["opts"]>(() => ({
    startIndex: at,
    watchDrag: (embla, event) => dragNow.current && pagersDrag(event.target, embla.rootNode()),
  }));
  // Built again all the same (a resize, the pages' own change): back on the
  // app's page at once, whichever page Embla started from.
  const rebuilt = useEffectEvent(() => {
    if (api && api.selectedScrollSnap() !== at) api.scrollTo(at, true);
  });
  useEffect(() => {
    if (!api) return;
    const again = () => rebuilt();
    api.on("reInit", again);
    return () => {
      api.off("reInit", again);
    };
  }, [api]);
  // A page picked by a tap (its bar of the grabber, a route made): the
  // grabber names that page from the tap, not from halfway through the
  // scroll; a finger's drag names the nearer page as it moves.
  const target = useRef<number | null>(null);
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
  // Where it is heading while it moves, for the grabber's capsule: Embla's
  // own scroll progress (0 on Search, 1 on FPL) at each of its scroll
  // events, nearer page first, and none once it settles -- or once, let go,
  // it is within a point of the page it lands on: Embla's settle comes
  // after a creep of fractions of a pixel that takes a third of a second
  // and more, which nobody sees move, and the capsule's second (SheetGrabber's
  // HOLD_MS) waited on it, the name up some three seconds after a swipe
  // (sheet-pages.spec, 2026-11-13: the page within half a pixel 0.3 s
  // before settle, at rest 1.1 to 1.5 s after the swipe).
  useEffect(() => {
    if (!api) return;
    let held = false;
    const still = () => {
      target.current = null;
      setPageHeading(null);
    };
    const moving = () => {
      const last = api.scrollSnapList().length - 1;
      const pages = api.scrollProgress() * last;
      const off = Math.abs(pages - api.selectedScrollSnap()) * api.rootNode().clientWidth;
      if (!held && off < 1) return still();
      setPageHeading(target.current ?? Math.min(last, Math.max(0, Math.round(pages))));
    };
    const touched = () => {
      held = true;
      target.current = null;
    };
    const released = () => {
      held = false;
    };
    api.on("scroll", moving);
    api.on("settle", still);
    api.on("pointerDown", touched);
    api.on("pointerUp", released);
    return () => {
      api.off("scroll", moving);
      api.off("settle", still);
      api.off("pointerDown", touched);
      api.off("pointerUp", released);
      still();
    };
  }, [api]);
  // At a sideways list's end the swipe goes on to the page (the owner,
  // 2026-11-11: "At the end of the scroll, it should swipe", for every
  // list and either way), as a phone's nested scrolling hands a drag on: a
  // finger that keeps pulling past the list's last item (or before its
  // first) turns the page by the stock
  // carousel's own scrollNext / scrollPrev, once a touch. Embla has no
  // option for a nested scroller's end, so the touch is watched here.
  useEffect(() => {
    if (!api || !drag) return;
    const root = api.rootNode();
    let row: Ends | null = null;
    let lastX = 0;
    let pull = 0;
    let turned = false;
    const start = (event: TouchEvent) => {
      row = sidewaysList(event.target, root);
      lastX = event.touches[0]?.clientX ?? 0;
      pull = 0;
      turned = false;
    };
    const move = (event: TouchEvent) => {
      const x = event.touches[0]?.clientX;
      if (!row || turned || x === undefined) return;
      const dx = x - lastX;
      lastX = x;
      if (dx < 0 && row.end()) pull = Math.min(0, pull) + dx;
      else if (dx > 0 && row.start()) pull = Math.max(0, pull) + dx;
      else pull = 0;
      if (pull <= -PULL_PAST_END && api.canScrollNext()) {
        turned = true;
        api.scrollNext();
      } else if (pull >= PULL_PAST_END && api.canScrollPrev()) {
        turned = true;
        api.scrollPrev();
      }
    };
    root.addEventListener("touchstart", start, { passive: true });
    root.addEventListener("touchmove", move, { passive: true });
    return () => {
      root.removeEventListener("touchstart", start);
      root.removeEventListener("touchmove", move);
    };
  }, [api, drag]);
  useOwnDrags(api);
  // A page picked elsewhere (its bar of the grabber, a route made, a link): the pager
  // follows, at once under Reduce Motion.
  useEffect(() => {
    if (!api) return;
    // Off Search, its field let go, so a phone's keyboard goes down and
    // nothing typed lands on a page out of sight: whatever had the focus on
    // a page now put away.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && api.slideNodes().some((page, i) => i !== at && page.contains(focused))) focused.blur();
    if (api.selectedScrollSnap() === at) return;
    const jump = prefersReducedMotion();
    if (!jump) {
      target.current = at;
      setPageHeading(at);
    }
    api.scrollTo(at, jump);
  }, [api, at]);
  return (
    <Carousel
      opts={opts}
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
        {pages(shown).map((page, i) => (
          <CarouselItem key={i} className="flex min-h-0 flex-col pl-0" data-sheet-page={i} data-shown={i === shown || undefined}>
            {page}
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
