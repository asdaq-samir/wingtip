import { useRef, type ReactNode } from "react";
import { Share } from "lucide-react";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import RoundButton from "./RoundButton";
import { PinnedHead } from "./PinnedHead";
import { closeTopCard, useHeldCard, type PillHead } from "../lib/openCards";
import { TEXT } from "../lib/text";

/**
 * An airport's or an airplane's card's head, with no picture over it (the
 * owner, 2026-11-09: "no photo at the top of the airport or airplane
 * card"; the order title, actions, then the card's sections, the pictures
 * lower in it, CardPictures): its name in one row pinned at the sheet's
 * top (PinnedHead; the owner, 2026-11-10: no large title), what it is and
 * a line under that scrolling with the card, and at the row's right its share, a round button of its own
 * (`beside`: an airplane's star, an airport's, the owner 2026-11-11) and
 * its close, which goes back one card, as every card's does. What the
 * pill shows of it down at its smallest is its own (`pill`).
 */
export function CardTitle({
  title,
  subtitle,
  line,
  onClose,
  onShare,
  beside,
  pill,
  testId,
  titleTestId,
  subtitleTestId,
  closeTestId,
  shareTestId,
  twoLines = false,
}: {
  title: string;
  subtitle?: ReactNode;
  line?: ReactNode;
  onClose: () => void;
  onShare?: () => void;
  /** A round button before the close (the star). */
  beside?: ReactNode;
  pill?: PillHead;
  testId: string;
  titleTestId: string;
  subtitleTestId?: string;
  closeTestId: string;
  shareTestId?: string;
  /** The subtitle two lines tall whatever it holds, so the card keeps one
   *  layout for a short name and a long one (places.spec). */
  twoLines?: boolean;
}) {
  useHeldCard(onClose, onShare, true, pill);
  const name = useRef<HTMLHeadingElement>(null);
  const close = () => {
    if (!closeTopCard()) onClose();
  };
  return (
    <>
      <PinnedHead testId={testId}>
        <h2
          ref={name}
          tabIndex={-1}
          className={cn("min-w-0 flex-1 truncate font-bold tracking-tight text-foreground outline-none", TEXT.card)}
          data-testid={titleTestId}
        >
          {title}
        </h2>
        <div className="flex shrink-0 gap-2.5">
          {onShare && (
            <RoundButton label={`Share ${title}`} onClick={onShare} data-testid={shareTestId}>
              <Share className="size-5" strokeWidth={2} />
            </RoundButton>
          )}
          {beside}
          <CloseButton onClick={close} data-back="" data-testid={closeTestId} />
        </div>
      </PinnedHead>
      {(subtitle != null || line != null) && (
        <div className="min-w-0 pt-1">
          {subtitle != null && (
            <p className={cn("line-clamp-2 text-foreground/80", twoLines && "min-h-[2lh]", TEXT.prose)} data-testid={subtitleTestId}>
              {subtitle}
            </p>
          )}
          {line}
        </div>
      )}
    </>
  );
}
