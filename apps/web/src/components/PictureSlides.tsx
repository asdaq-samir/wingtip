import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "cn";
import { TEXT } from "../lib/text";

/**
 * A photo filling a page of the box, its credit over its corner as its
 * licence asks: a tap opens it full screen (`onOpen`); without one, in a
 * card's head, the head opens it (CardPictures).
 */
export function PhotoSlide({
  src,
  alt,
  credit,
  onOpen,
  label,
  testId,
  creditTestId,
}: {
  src: string;
  alt: string;
  /** Where its licence asks for one; none for the USGS's public domain. */
  credit?: string;
  onOpen?: () => void;
  /** The tap's name, for VoiceOver. */
  label: string;
  testId?: string;
  creditTestId?: string;
}) {
  const picture = <img src={src} alt={alt} loading="lazy" className="size-full rounded-xl object-cover" />;
  return (
    <>
      {onOpen ? (
        <BaseButton
          onClick={onOpen}
          aria-label={label}
          className="absolute inset-0 block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          data-testid={testId}
        >
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
            "pointer-events-none absolute right-1 bottom-3.5 max-w-[90%] truncate rounded bg-black/55 px-1 text-white",
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
