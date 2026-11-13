import { useContext, type ReactNode, type Ref } from "react";
import { Share } from "lucide-react";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import { HeadGrid } from "./HeadGrid";
import { PinnedHead } from "./PinnedHead";
import RoundButton from "./RoundButton";
import { closeTopCard, useHeldCard, RouteShareMenu, type CardShare } from "../lib/openCards";
import { TEXT } from "../lib/text";

/**
 * Every card's one head row (the card rule's 8, the same thing the same
 * component: the owner, 2026-11-11, "Are we using two different cards?"),
 * pinned at the card's top with the card scrolling under it (PinnedHead),
 * laid out as Apple Maps' place card at its smallest size (HeadGrid; the
 * owner, 2026-11-11, "let's move the title in the middle"): at its start
 * a form's Cancel (`leading`), or the card's Share (`children`); two
 * buttons at most with the close (rules.md: a refresh, the flight rules or
 * a filter goes in the Share menu or the card's content); its name and the short line under it (`sub`, in sight at the
 * smallest size too) centred across the card; and at its end the close
 * alone, or a form's Save (`end`). SheetCard draws it from its props; a
 * card whose content draws its own head (CardHead, CardTitle) draws this
 * same row.
 */
export function CardHeadRow({
  name,
  sub,
  nameId,
  nameTestId,
  leading,
  wrap = false,
  end,
  testId,
  hidden = false,
  level = "h2",
  nameRef,
  slot,
  flush = false,
  children,
}: {
  name: ReactNode;
  sub?: ReactNode;
  /** The name's id, which names the card for a screen reader. */
  nameId?: string;
  nameTestId?: string;
  leading?: ReactNode;
  /** The name over as many lines as it takes (a plate's), not cut short. */
  wrap?: boolean;
  end?: ReactNode;
  /** The row's test id (PinnedHead's). */
  testId?: string;
  /** For a screen reader alone: content that opens with its own field and
   *  close (the airport search's). */
  hidden?: boolean;
  /** A page's in a card (Settings' pages, a list in full): h3 under the
   *  card's own h2. */
  level?: "h2" | "h3";
  /** The name, for the focus as a page is pushed (ConsolePages). */
  nameRef?: Ref<HTMLHeadingElement>;
  /** PinnedHead's: its slot, and a scroller with no sides of its own. */
  slot?: string;
  flush?: boolean;
  children?: ReactNode;
}) {
  const Name = level;
  const middle = (
    <>
      <Name
        ref={nameRef}
        id={nameId}
        tabIndex={-1}
        className={cn("max-w-full font-bold tracking-tight text-foreground outline-none", wrap ? "break-words" : "truncate", TEXT.card)}
        data-testid={nameTestId}
      >
        {name}
      </Name>
      {sub != null && sub !== "" && (
        <p
          className={cn("max-w-full text-muted-foreground tabular-nums", wrap ? "break-words" : "truncate", TEXT.note)}
          data-testid="card-sub"
        >
          {sub}
        </p>
      )}
    </>
  );
  const start =
    leading != null || children != null ? (
      <>
        {leading}
        {children}
      </>
    ) : undefined;
  if (hidden)
    return (
      <div className="sr-only">
        {start}
        {middle}
        {end}
      </div>
    );
  return (
    <PinnedHead testId={testId} slot={slot} flush={flush} className="shrink-0">
      <HeadGrid start={start} middle={middle} end={end} />
    </PinnedHead>
  );
}

/**
 * A card's head: its name, the line under it in a note's grey (what it
 * is, not text to read, as the line under a place's name is in Maps),
 * its Share at the row's start (CardShareButton) and the close alone at
 * its end: two buttons at most (rules.md), what else acts on the card in
 * its Share menu or its content.
 */
export function CardHead({
  name,
  sub,
  line,
  nameTestId,
  lineClassName,
  lineTestId,
  onClose,
  onShare,
  closeTestId,
}: {
  name: ReactNode;
  /** A short line under the name in its pinned row, in sight at every size,
   *  the smallest too (the owner, 2026-11-11: the Nav Log's totals, the
   *  Profile's cruise and clearance, the Stops' count). */
  sub?: ReactNode;
  /** Under the name; none where the caller sets it out itself (an
   *  airport's card, beside its diagram's thumbnail). */
  line?: ReactNode;
  nameTestId?: string;
  lineClassName?: string;
  lineTestId?: string;
  onClose: () => void;
  /** Its share, at the row's start (CardShareButton). */
  onShare?: CardShare;
  closeTestId: string;
}) {
  // Its name and close one row pinned at the sheet's top, the card
  // scrolling under it (PinnedHead; the owner, 2026-11-10); the line under
  // the name scrolls with the card.
  return (
    <>
      <CardHeadRow
        name={name}
        sub={sub}
        nameTestId={nameTestId}
        end={<CardClose onClose={onClose} onShare={onShare} testId={closeTestId} />}
      >
        <CardShareButton onShare={onShare} />
      </CardHeadRow>
      {line != null && (
        <p className={cn("text-muted-foreground", TEXT.note, lineClassName)} data-testid={lineTestId}>
          {line}
        </p>
      )}
    </>
  );
}

/**
 * A card's close at its head's end, inline with its name, at the owner's
 * ask ("Close should not be anywhere except the top right corner of the
 * card inline with label"), now the tabs stay over a card as the
 * platform's own do (TabBar): it goes back one (a page opened in the card
 * first, else the card, lib/openCards), as a device's Back does. It holds
 * the card open with its share (`onShare`, for the bar's Share), which
 * the head draws at its start (CardShareButton).
 */
export function CardClose({
  onClose,
  onShare,
  testId,
  className,
}: {
  onClose: () => void;
  /** The card's share: an airport's, an airplane's, or the route's menu
   *  for the Brief, the nav log and the profile, each its own. */
  onShare?: CardShare;
  testId: string;
  className?: string;
}) {
  useHeldCard(onClose, onShare);
  return (
    <CloseButton
      className={className}
      onClick={() => {
        if (!closeTopCard()) onClose();
      }}
      data-back=""
      data-testid={testId}
    />
  );
}

/** A card's Share at its head's start, as Apple Maps' place card has it
 *  (the owner, 2026-11-11): its own, or the route's menu (•••) for the
 *  Brief, the nav log and the profile. */
function CardShareButton({ onShare }: { onShare?: CardShare }) {
  const routeShare = useContext(RouteShareMenu);
  if (typeof onShare === "string") return routeShare?.(onShare) ?? null;
  if (!onShare) return null;
  return (
    <RoundButton label="Share" onClick={onShare} data-testid="card-share">
      <Share className="size-5" strokeWidth={2} />
    </RoundButton>
  );
}
