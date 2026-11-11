import { useContext, type ReactNode, type Ref } from "react";
import { Share } from "lucide-react";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import { PinnedHead } from "./PinnedHead";
import RoundButton from "./RoundButton";
import { closeTopCard, useHeldCard, RouteShareMenu, type CardShare } from "../lib/openCards";
import { TEXT } from "../lib/text";

/**
 * Every card's one head row (the card rule's 8, the same thing the same
 * component: the owner, 2026-11-11, "Are we using two different cards?"),
 * pinned at the card's top with the card scrolling under it (PinnedHead):
 * at its start a form's Cancel where it has one (`leading`), its name and
 * the short line under it (`sub`, in sight at the smallest size too), the
 * buttons beside them (`children`: a star, a refresh, the flight rules),
 * and at its end the close or a form's Save (`end`). SheetCard draws it
 * from its props; a card whose content draws its own head (CardHead,
 * CardTitle) draws this same row.
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
  fit = false,
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
  /** The name as wide as its words, what goes beside it (`children`) right
   *  after it and the end at the row's end (the Stops' distance menu). */
  fit?: boolean;
  /** PinnedHead's: its slot, and a scroller with no sides of its own. */
  slot?: string;
  flush?: boolean;
  children?: ReactNode;
}) {
  const Name = level;
  const row = (
    <>
      {leading}
      <div className={cn("flex min-w-0 flex-col", !fit && "flex-1", leading && "text-center")}>
        <Name
          ref={nameRef}
          id={nameId}
          tabIndex={-1}
          className={cn("font-bold tracking-tight text-foreground outline-none", wrap ? "break-words" : "truncate", TEXT.card)}
          data-testid={nameTestId}
        >
          {name}
        </Name>
        {sub != null && sub !== "" && (
          <p className={cn("text-muted-foreground tabular-nums", wrap ? "break-words" : "truncate", TEXT.note)} data-testid="card-sub">
            {sub}
          </p>
        )}
      </div>
      {children}
      {end != null && <div className={cn("-mr-1 flex shrink-0 items-center gap-2.5", fit && "ml-auto")}>{end}</div>}
    </>
  );
  if (hidden) return <div className="sr-only flex shrink-0 items-center gap-2">{row}</div>;
  return (
    <PinnedHead testId={testId} slot={slot} flush={flush} className="shrink-0">
      {row}
    </PinnedHead>
  );
}

/**
 * A card's head: its name, the line under it in a note's grey (what it
 * is, not text to read, as the line under a place's name is in Maps),
 * what goes beside them (an airport's weather and its star), and the
 * close, out to the head's row's inset (px-3) as the route's close is.
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
  children,
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
  /** Its share, beside its close (CardClose). */
  onShare?: CardShare;
  closeTestId: string;
  /** Between the name and the close. */
  children?: ReactNode;
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
        {children}
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
 * A card's Share and close at its head's end, inline with its name, at the
 * owner's ask ("Close should not be anywhere except the top right corner
 * of the card inline with label"), now the tabs stay over a card as the
 * platform's own do (TabBar): its Share where it has one -- its own, or
 * the route's menu for the Brief, the nav log and the profile -- and the
 * close, which goes back one (a page opened in the card first, else the
 * card, lib/openCards), as a device's Back does.
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
  const routeShare = useContext(RouteShareMenu);
  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      {typeof onShare === "string"
        ? routeShare?.(onShare)
        : onShare && (
            <RoundButton label="Share" onClick={onShare} data-testid="card-share">
              <Share className="size-5" strokeWidth={2} />
            </RoundButton>
          )}
      <CloseButton
        onClick={() => {
          if (!closeTopCard()) onClose();
        }}
        data-back=""
        data-testid={testId}
      />
    </div>
  );
}
