import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "cn";
import { TEXT } from "../lib/text";

/**
 * A photo filling a page of the box, its credit over its corner as its
 * licence asks: a tap opens it full screen (`onOpen`), or its source's page
 * (`href`), as each card's does; with neither, in a card's head, the head
 * opens it (CardPictures).
 */
export function PhotoSlide({
  src,
  alt,
  credit,
  href,
  onOpen,
  label,
  testId,
  creditTestId,
  flush = false,
}: {
  src: string;
  alt: string;
  /** Where its licence asks for one; none for the USGS's public domain. */
  credit?: string;
  href?: string;
  onOpen?: () => void;
  /** The tap's name, for VoiceOver. */
  label: string;
  testId?: string;
  creditTestId?: string;
  /** Across a card's top (PictureSlides' `flush`): square, its credit in
   *  the top left, out of the way of the name over its foot and of the
   *  share and close in the top right. */
  flush?: boolean;
}) {
  const picture = <img src={src} alt={alt} loading="lazy" className={cn("size-full object-cover", !flush && "rounded-xl")} />;
  const tap = cn(
    "absolute inset-0 block outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
    !flush && "rounded-xl",
  );
  return (
    <>
      {href ? (
        <a href={href} target="_blank" rel="noopener" aria-label={label} className={tap} data-testid={testId}>
          {picture}
        </a>
      ) : onOpen ? (
        <BaseButton onClick={onOpen} aria-label={label} className={tap} data-testid={testId}>
          {picture}
        </BaseButton>
      ) : (
        // In a card's head, whose tap shows it alone and whose full-screen
        // click opens it (CardPictures): a picture, not a control.
        <div role="img" aria-label={label} className="absolute inset-0" data-testid={testId}>
          {picture}
        </div>
      )}
      {credit && (
        <span
          className={cn(
            "pointer-events-none absolute max-w-[90%] truncate rounded bg-black/55 px-1 text-white",
            flush ? "top-3 left-3 max-w-[55%]" : "right-1 bottom-3.5",
            TEXT.caption,
          )}
          data-testid={creditTestId}
        >
          {credit}
        </span>
      )}
    </>
  );
}
