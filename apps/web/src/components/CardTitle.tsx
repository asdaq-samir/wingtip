import type { ReactNode } from "react";
import { Share } from "lucide-react";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import RoundButton from "./RoundButton";
import { closeTopCard, useHeldCard, type PillHead } from "../lib/openCards";
import { TEXT } from "../lib/text";

/**
 * An airport's or an airplane's card's head, with no picture over it (the
 * owner, 2026-11-09: "no photo at the top of the airport or airplane
 * card"; the order title, actions, then the card's sections, the pictures
 * lower in it, CardPictures): its name large, what it is under it and a
 * line under that, and at its right its share, its star (`beside`) and
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
}) {
  useHeldCard(onClose, onShare, true, pill);
  return (
    <div className="flex items-start gap-2 pt-[var(--corner-inset,0.75rem)]" data-testid={testId}>
      <div className="min-w-0 flex-1">
        <h2
          tabIndex={-1}
          className={cn("truncate font-extrabold tracking-tight text-foreground outline-none", TEXT.hero)}
          data-testid={titleTestId}
        >
          {title}
        </h2>
        {subtitle != null && (
          <p className={cn("line-clamp-2 text-foreground/80", TEXT.prose)} data-testid={subtitleTestId}>
            {subtitle}
          </p>
        )}
        {line}
      </div>
      <div className="flex shrink-0 gap-2.5">
        {onShare && (
          <RoundButton label={`Share ${title}`} onClick={onShare} data-testid={shareTestId}>
            <Share className="size-5" strokeWidth={2} />
          </RoundButton>
        )}
        {beside}
        <CloseButton
          onClick={() => {
            if (!closeTopCard()) onClose();
          }}
          data-back=""
          data-testid={closeTestId}
        />
      </div>
    </div>
  );
}
