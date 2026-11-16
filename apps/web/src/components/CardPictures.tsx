import { Button as BaseButton } from "@base-ui/react/button";
import { useState, type ReactNode } from "react";
import { Carousel, CarouselContent, CarouselItem } from "./ui/carousel";

/** One picture of a card's strip: what it shows, and a click's lightbox
 *  (`open`, the card's own Base UI Dialog viewer) or its source's page
 *  (`href`, where its terms ask it be linked: Planespotters'). */
export type CardSlide = {
  key: string;
  picture: ReactNode;
  open?: () => void;
  href?: string;
  /** The click's name, for VoiceOver. */
  label: string;
  testId?: string;
};

// A tile 70% of the card's width, so the next one shows at the edge and
// says the row goes on; one alone the card's whole width, where it was
// two-thirds with nothing beside it (N654FL's sketch, 2026-11-13).
const SLIDE = "basis-[70%] pl-3 sm:basis-[60%]";
const SLIDE_ALONE = "basis-full pl-3";

// The strip is one height whatever it holds, so a photo arriving or found
// missing moves nothing below it: the height of a 4:3 tile at the 70% (60%
// from sm) width, worked from the strip's own width (the wrapper is a size
// container). The 12 point gutter is taken in: a tile is basis x (W + 12) - 12.
const STRIP_HEIGHT = "h-[calc((70cqw-3.6px)*0.75)] sm:h-[calc((60cqw-4.8px)*0.75)]";

const TILE =
  "absolute inset-0 block size-full overflow-hidden rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

/**
 * A card's pictures under its actions: a row of large rounded tiles that
 * slides sideways, the next one showing past the edge, as Apple Maps'
 * place card on the web lays out a place's photos (the owner's
 * screenshot, 2026-11-10). It was a box a page at a time with dots under
 * the card's sections. On shadcn's Carousel (Embla), as before; each tile
 * a click to its lightbox or its source's page. Nothing where there are
 * none.
 */
export function CardPictures({
  slides,
  label,
  testId,
}: {
  slides: (CardSlide | null | false | undefined)[];
  label: string;
  testId: string;
}) {
  const present = slides.filter((s): s is CardSlide => !!s);
  // A picture that arrives later goes after those already in the row, never
  // before the one in view (FL-23); the first draw keeps the card's order.
  const [order, setOrder] = useState<string[]>(() => present.map((s) => s.key));
  const keys = present.map((s) => s.key);
  const next = [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k))];
  if (next.join("\n") !== order.join("\n")) setOrder(next);
  const shown = [...present].sort((a, b) => next.indexOf(a.key) - next.indexOf(b.key));
  if (!shown.length) return null;
  return (
    <div className="@container">
      {/* A sideways drag the row's, an up or down one the sheet's (the one scrolling rule). */}
      <Carousel opts={{ align: "start", dragFree: true }} aria-label={label} data-base-ui-swipe-ignore="x" data-testid={testId}>
        {/* 12 points between the tiles, as Maps' have. */}
        <CarouselContent className="-ml-3">
          {shown.map((slide) => (
            <CarouselItem key={slide.key} className={shown.length > 1 ? SLIDE : SLIDE_ALONE}>
              <div className={`relative ${STRIP_HEIGHT} overflow-hidden rounded-(--radius-card) bg-foreground/8`}>
                {slide.href ? (
                  <a href={slide.href} target="_blank" rel="noopener" aria-label={slide.label} className={TILE} data-testid={slide.testId}>
                    {slide.picture}
                  </a>
                ) : slide.open ? (
                  <BaseButton onClick={slide.open} aria-label={slide.label} className={TILE} data-testid={slide.testId}>
                    {slide.picture}
                  </BaseButton>
                ) : (
                  <div role="img" aria-label={slide.label} className="absolute inset-0" data-testid={slide.testId}>
                    {slide.picture}
                  </div>
                )}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
