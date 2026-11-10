import type { ReactNode } from "react";
import { PillSection } from "./Favorites";
import { PictureSlides } from "./PictureSlides";

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

/**
 * A card's pictures, lower in it (the owner, 2026-11-09: no photo at the
 * card's top; the photos and the aerial a carousel under its sections):
 * the stock carousel (PictureSlides, shadcn's Carousel on Embla), each
 * page a click to its lightbox. Nothing where there are none.
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
  const shown = slides.filter((s): s is CardSlide => !!s);
  if (!shown.length) return null;
  return (
    <PillSection title="Pictures" testId={testId}>
      <PictureSlides
        label={label}
        className="h-48"
        testId={`${testId}-slides`}
        slides={shown.map((slide) =>
          slide.href ? (
            <a
              key={slide.key}
              href={slide.href}
              target="_blank"
              rel="noopener"
              aria-label={slide.label}
              className="absolute inset-0 block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              data-testid={slide.testId}
            >
              {slide.picture}
            </a>
          ) : slide.open ? (
            <button
              key={slide.key}
              type="button"
              onClick={slide.open}
              aria-label={slide.label}
              className="absolute inset-0 block size-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              data-testid={slide.testId}
            >
              {slide.picture}
            </button>
          ) : (
            <div key={slide.key} role="img" aria-label={slide.label} className="absolute inset-0" data-testid={slide.testId}>
              {slide.picture}
            </div>
          ),
        )}
      />
    </PillSection>
  );
}
