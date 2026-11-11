import { useCallback, useContext, type ReactNode } from "react";
import { Share } from "lucide-react";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import { PinnedHead } from "./PinnedHead";
import RoundButton from "./RoundButton";
import { closeTopCard, useHeldCard, RouteShareMenu, type CardShare } from "../lib/openCards";
import { TEXT } from "../lib/text";
import type { PanelState } from "../lib/mapChrome";
import type { CardFrame } from "../lib/sheetCards";
import { CardLayer } from "./sheet/CardLayer";

/**
 * A card in the map's panel, as a place's is in Maps -- an airport's
 * (PlaceCard), the airspace over a point (AirspaceCard), the fields
 * nearest the pilot (NearestCard): its head at the top and its sections
 * under it, scrolling. Its top is the panel's corner's (MapPanel's
 * --corner-inset), so its close is where every panel's top-right button
 * is, at the pilot's ask.
 *
 * A card of its own over the sheet, the stock Drawer's nested drawer
 * (CardLayer, sheet/CardStack; the owner, 2026-11-11), opened anew at its
 * top in its own scroller.
 */
export function PanelCard({
  testId,
  opens,
  cardId,
  dismiss,
  children,
}: {
  testId: string;
  /** The size it opens at (CardLayer): half from the search or the map, a list all the way up. */
  opens?: PanelState;
  /** Its id where the card's own component sizes it (useCardSize). */
  cardId?: string;
  /** What its drawer tells it (CardLayer's): Escape, a tap outside. */
  dismiss?: CardFrame["dismiss"];
  children: ReactNode;
}) {
  // Opened from a marker on the chart with the keys (Enter on it), the
  // focus goes to the card's name, which a screen reader then reads, and
  // back to the marker as the card is put away -- where it stayed on the
  // marker, the card a page away in the tab order and said by nothing.
  // As it is put in its drawer: the focus where it is then is the marker's.
  const card = useCallback((node: HTMLDivElement | null) => {
    const from = document.activeElement as HTMLElement | null;
    if (!node || !from?.closest(".maplibregl-map")) return;
    node.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    return () => {
      const at = document.activeElement;
      if (from.isConnected && (!at || at === document.body || node.contains(at))) from.focus({ preventScroll: true });
    };
  }, []);
  // There at once as it opens, still while the sheet moves round it, as a
  // tab's own page is (TabPage), at the owner's ask ("Is the airport and
  // aircraft card same style? Can it be common to other sheets where
  // sheet/content is not moving when viewed?"): it came in faded and up
  // into its place over half a second, an airport's, where an airplane's,
  // a TabPage, was there at once. Laid out whole in its drawer's scroller,
  // its room over its first line the grabber's (--pinned-room), which its
  // pinned head reaches up over.
  return (
    <CardLayer opens={opens} cardId={cardId} dismiss={dismiss}>
      <div
        ref={card}
        className="relative shrink-0 px-4 pt-(--pinned-room) pb-[max(1rem,env(safe-area-inset-bottom))] [--pinned-room:var(--corner-inset,0.75rem)] print:hidden"
        data-testid={testId}
      >
        {children}
      </div>
    </CardLayer>
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
      <PinnedHead>
        <h2
          tabIndex={-1}
          className={cn("min-w-0 flex-1 truncate font-bold tracking-tight text-foreground outline-none", TEXT.card)}
          data-testid={nameTestId}
        >
          {name}
        </h2>
        {children}
        <CardClose onClose={onClose} onShare={onShare} testId={closeTestId} className="-mr-1" />
      </PinnedHead>
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
