import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "cn";
import { safeHref } from "../lib/safeHref";
import { TEXT } from "../lib/text";

/**
 * A photo filling a page of the box, its credit over its corner as its
 * licence asks, a link to the photo's page where it has one: a tap opens
 * it full screen (`onOpen`); without one, in a card's head, the head opens
 * it (CardPictures).
 */
export function PhotoSlide({
  src,
  alt,
  credit,
  creditHref,
  onOpen,
  label,
  testId,
  creditTestId,
}: {
  src: string;
  alt: string;
  /** Where its licence asks for one; none for the USGS's public domain. */
  credit?: string;
  /** The photo's own page, where its licence and author are given in full
   *  (a Wikimedia Commons file's): the credit is then a link to it, as
   *  the Creative Commons licences ask a reuse to point to them. */
  creditHref?: string;
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
      {credit && <PhotoCredit credit={credit} href={creditHref} testId={creditTestId} />}
    </>
  );
}

/** A photo's credit over its corner, as its licence asks: a link to the
 *  photo's own page where it has one, words alone where not. Drawn beside
 *  a tile's button, never inside it (CardPictures' `credit`): a link in a
 *  button is two controls in one, axe's nested-interactive. */
export function PhotoCredit({ credit, href: given, testId }: { credit: string; href?: string; testId?: string }) {
  // The photo's page comes from others' data (Planespotters, Wikimedia):
  // only an address the app may open (safeHref), else the words alone.
  const href = given ? safeHref(given) : undefined;
  return href ? (
    // Over the picture's own tap, its hit area grown by a pseudo-element
    // to 44 points, the caption itself kept its size.
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("absolute right-1 bottom-3.5 max-w-[90%] truncate rounded bg-black/55 px-1 text-white underline hit-3.5", TEXT.caption)}
      data-testid={testId}
    >
      {credit}
    </a>
  ) : (
    <span
      className={cn(
        "pointer-events-none absolute right-1 bottom-3.5 max-w-[90%] truncate rounded bg-black/55 px-1 text-white",
        TEXT.caption,
      )}
      data-testid={testId}
    >
      {credit}
    </span>
  );
}
