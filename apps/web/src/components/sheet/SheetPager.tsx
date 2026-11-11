import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { cn } from "cn";
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
  /** A page picked, by a swipe or its dot. */
  go: (page: number) => void;
  /** Each page's name, for its dot and a screen reader. */
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
  // A page picked elsewhere (its dot, a route made, a link): the pager
  // follows, at once under Reduce Motion.
  useEffect(() => {
    if (api && api.selectedScrollSnap() !== at) api.scrollTo(at, prefersReducedMotion());
  }, [api, at]);
  return (
    <Carousel
      opts={{ startIndex: start, watchDrag: drag }}
      setApi={setApi}
      // The arrow keys are the field's and the lists' here, not the pager's:
      // the dots (Tabs) step the pages from the keyboard.
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

/**
 * The pages' dots under the grabber, iOS's page control on Base UI's Tabs:
 * the one up filled, a tap or the arrow keys picking another, each said
 * "Page 1 of 2, Search". The global 44-point hit area round each button
 * (index.css), the two meeting between the dots, not overlapping.
 */
export function PageDots({
  at,
  go,
  names,
  className,
}: {
  at: number;
  go: (page: number) => void;
  names: readonly string[];
  className?: string;
}) {
  return (
    <Tabs.Root
      value={at}
      onValueChange={(value) => go(Number(value))}
      className={cn("pointer-events-none absolute inset-x-0 z-20 flex h-4 justify-center print:hidden", className)}
    >
      <Tabs.List aria-label="Pages" activateOnFocus className="pointer-events-auto flex h-full">
        {names.map((name, i) => (
          <Tabs.Tab
            key={name}
            value={i}
            aria-label={`Page ${i + 1} of ${names.length}, ${name}`}
            data-testid={`sheet-page-dot-${i}`}
            className={cn(
              "group/dot relative flex h-full w-8 items-center rounded-full px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              i === 0 ? "justify-end after:right-0!" : "justify-start after:left-0!",
              // Over the grabber's row it is the grabber's; under it, the first row's.
              "after:-top-3! after:bottom-0!",
            )}
          >
            <span
              className="size-2 rounded-full bg-muted-foreground/40 transition-colors group-data-active/dot:bg-foreground"
              aria-hidden="true"
            />
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
