import type { ReactNode } from "react";
import { Share } from "lucide-react";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import RoundButton from "./RoundButton";
import { CardHeadRow } from "./CardHead";
import { closeTopCard, useHeldCard, type PillHead } from "../lib/openCards";
import { TEXT } from "../lib/text";

/**
 * An airport's or an airplane's card's head, with no picture over it (the
 * owner, 2026-11-09: "no photo at the top of the airport or airplane
 * card"; the order title, actions, then the card's sections, the pictures
 * lower in it, CardPictures): its name in one row pinned at the sheet's
 * top (PinnedHead; the owner, 2026-11-10: no large title), what it is and
 * a line under that scrolling with the card; at the row's start its share,
 * the name centred, and at its end its close, which goes back one card, as
 * every card's does: two buttons at most (the owner, 2026-11-11: the star
 * a Favorite tile in the card's action row). What the
 * pill shows of it down at its smallest is its own (`pill`).
 */
export function CardTitle({
  title,
  sub,
  subtitle,
  line,
  onClose,
  onShare,
  pill,
  testId,
  titleTestId,
  subtitleTestId,
  closeTestId,
  shareTestId,
  twoLines = false,
}: {
  title: string;
  /** The line under the name inside the pinned head row, centred with it
   *  and in sight at the card's smallest size too (an airport's full name,
   *  as Apple Maps' place card writes its kind under its name). */
  sub?: ReactNode;
  subtitle?: ReactNode;
  line?: ReactNode;
  onClose: () => void;
  onShare?: () => void;
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
  const close = () => {
    if (!closeTopCard()) onClose();
  };
  return (
    <>
      <CardHeadRow
        name={title}
        sub={sub}
        nameTestId={titleTestId}
        testId={testId}
        end={<CloseButton onClick={close} data-back="" data-testid={closeTestId} />}
      >
        {/* Its Share at the row's start, as Apple Maps' place card has it
            (the owner, 2026-11-11), the close alone at its end. */}
        {onShare && (
          <RoundButton label={`Share ${title}`} onClick={onShare} data-testid={shareTestId}>
            <Share className="size-5" strokeWidth={2} />
          </RoundButton>
        )}
      </CardHeadRow>
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
