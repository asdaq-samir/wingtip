import { isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, useEffectEvent } from "react";
import { createPortal } from "react-dom";
import type { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import { PinnedHead } from "./PinnedHead";
import { useCardFrame } from "./sheet/useCardFrame";
import { holdOpenCard, setCardPill, type OpenCard, type PillHead } from "../lib/openCards";
import { CardId, SheetCardHead } from "../lib/sheetCards";
import { TEXT } from "../lib/text";

/**
 * A card over the map's sheet on a phone, opened from anywhere on the page:
 * a control's (ResponsivePopover's -- the Map settings, the approaches, an
 * airplane's form) or a thing tapped on the chart (the map's openCard -- a
 * checkpoint, a VFR waypoint, a TFR). Each was a sheet floating over the
 * panel, or a popup over the chart, two more surfaces over the one
 * the pilot already had; at the owner's ask ("Yes to all, let's have
 * consistency and common code", 2026-10-27) they are cards over the
 * sheet, as Maps opens a place's card over its sheet.
 *
 * Each is the stock Drawer's own nested drawer over the sheet
 * (sheet/CardStack, the owner 2026-11-11), with the sheet's sizes, grabber
 * and swipe. Drawn where the caller is, in React's tree, so what it reads
 * from its providers stays the same, and put in its drawer's scroller
 * (useCardFrame). The last opened on top: one opened from another (a hold
 * from the procedures) covers it, which stays as it was, its place in its
 * own scroller kept, and its close goes back to it.
 */

export function SheetCard({
  title,
  titleHidden = false,
  description,
  leading,
  action,
  closeButton,
  onClose,
  fullScreen = false,
  cardId,
  testId,
  returnFocus,
  initialFocus,
  finalFocus,
  children,
}: {
  /** Its name, at a card's size at the head's left. None where the
   *  content draws it in the head itself (SheetCardHead). */
  title?: string;
  /** Named for a screen reader only: content that opens with its own
   *  field and close (the airport search's). */
  titleHidden?: boolean;
  /** Under the name, a note's grey. */
  description?: string;
  /** At the head's start: a form's Cancel, as an iOS sheet puts it, the
   *  name then between the two. */
  leading?: ReactNode;
  /** At the head's end in the close's place: a form's Save, a Done, a
   *  close of the caller's own that goes back a page first. */
  action?: ReactNode;
  /** The app's close at the head's end; by default where nothing else is
   *  there (`action`, `leading`). False where the content's own Done is
   *  the way out. */
  closeButton?: boolean;
  onClose: () => void;
  /** Emergency, the one card all the way up as it opens (the card rule's 4);
   *  every other card opens at half. */
  fullScreen?: boolean;
  /** Its id among the open cards where its owner sizes it (useCardSize). */
  cardId?: string;
  testId?: string;
  /** Where the focus goes back to as it is put away: the control that
   *  opened it, where that is known. */
  returnFocus?: () => HTMLElement | null;
  /** Where the focus goes as it opens and as it goes, as Base UI's
   *  dialog takes them; by default its name, and back to `returnFocus`. */
  initialFocus?: Drawer.Popup.Props["initialFocus"];
  finalFocus?: Drawer.Popup.Props["finalFocus"];
  children: ReactNode;
}) {
  const ownId = useId();
  const id = cardId ?? ownId;
  const headingId = `${id}-name`;
  // Its entry among the open cards, for what its content says the pill
  // shows of it (a map card's, MapCard's `pill`).
  const held = useRef<OpenCard | null>(null);
  // Kept for the entry too: the content's effect runs before this card's
  // own, which holds the entry.
  const pillGiven = useRef<PillHead | undefined>(undefined);
  const setPill = useCallback((pill: PillHead | undefined) => {
    pillGiven.current = pill;
    if (held.current) setCardPill(held.current, pill);
  }, []);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // A close of the caller's own in the head (`action`, the app's
  // CloseButton): one that goes back a page first, the procedures'. With
  // the tab bar naming the card it is the bar's close that does it, and
  // the card draws no second one (the owner's screenshot, 2026-10-27: two
  // closes over the arrivals).
  const back = isValidElement<{ onClick?: () => void }>(action) && action.type === CloseButton ? action.props.onClick : undefined;
  // The caller's latest, for what is set up once as it opens.
  const backNow = useEffectEvent(() => (back ?? onClose)());

  // The top of what the bar's close, a swipe back and a device's Back take
  // away (lib/openCards), as every card's close is: back one, a page of the
  // card's first where it has one (`back`).
  useEffect(() => {
    const entry: OpenCard = { close: () => backNow(), pill: pillGiven.current };
    held.current = entry;
    const release = holdOpenCard(entry);
    return () => {
      held.current = null;
      release();
    };
  }, []);

  // The Drawer's word on Escape, a tap on the chart, ... as it was the
  // dialog's: the card on top alone hears it (CardStack).
  const dismiss = (details: Drawer.Root.ChangeEventDetails) => {
    // A tap on the chart puts it away, as a tap outside the sheets put
    // them away -- what the tap opens is what shows, where it opened under
    // it out of sight. Not the map's own buttons, nor the panel or
    // anything else on the page.
    if (details.reason === "outside-press") {
      const at = details.event.target instanceof Element ? details.event.target : null;
      if (!at?.closest(".maplibregl-map") || at.closest("[data-map-controls], .maplibregl-ctrl")) return details.cancel();
    }
    // Escape puts the top one away, ahead of the sheet's own Escape (which
    // lowers it) as the default is then prevented: back a page of the
    // card's first where it has one. A menu open in it is a layer over it
    // and closes first.
    if (details.reason === "escape-key" && back) {
      details.cancel();
      details.event.preventDefault();
      back();
      return;
    }
    onClose();
  };
  // The focus to its name as it opens, which a screen reader then reads --
  // once its name is drawn, the content put in its drawer a moment after
  // the drawer -- unless the caller says where (a search's field).
  const toName = () => {
    let tries = 0;
    const find = () => {
      const name = document.getElementById(headingId);
      if (name) name.focus({ preventScroll: true });
      else if (tries++ < 5) requestAnimationFrame(find);
    };
    requestAnimationFrame(find);
    return false;
  };
  // And back to what opened it as it is put away, once what it covered is
  // back (the control may have been under it), unless the focus has gone
  // somewhere of its own since.
  const toOpener = () => {
    const opener = returnFocus?.();
    const at = document.activeElement;
    const card = document.getElementById(headingId)?.closest("[data-sheet-card]");
    const free = !at || at === document.body || !at.isConnected || !!card?.contains(at);
    return opener?.isConnected && free ? opener : false;
  };
  const target = useCardFrame(
    { fullScreen, title, testId, labelledBy: headingId, dismiss, initialFocus: initialFocus ?? toName, finalFocus: finalFocus ?? toOpener },
    id,
  );

  // The name in its own head row, where the content draws it (a map
  // card's, MapCard).
  const head = useMemo(() => (title === undefined ? { slot, headingId, setPill } : null), [title, slot, headingId, setPill]);
  if (!target) return null;
  // Its own close at its head's end, the tabs over it being the page's,
  // not the card's (TabBar); or the caller's action in its place.
  const end =
    (closeButton ?? (action === undefined && !leading)) ? (
      <CloseButton onClick={onClose} data-back="" data-testid="sheet-card-close" />
    ) : (
      action
    );
  return createPortal(
    // Laid out whole in its drawer's scroller, as PanelCard is, from the
    // sheet's corner (its close where every card's is).
    <div className="relative shrink-0 px-4 pt-(--pinned-room) pb-[max(1rem,env(safe-area-inset-bottom))] [--pinned-room:var(--corner-inset,0.75rem)] print:hidden">
      {/* Its name at the left at a card's size and the close at the right
          end of its row, as CardHead sets a place's; a form's Cancel and
          Save at the two ends, the name between them: one row pinned at the
          card's top, the card scrolling under it (PinnedHead; the owner,
          2026-11-10). */}
      <HeadRow hidden={titleHidden}>
        {leading}
        {title === undefined ? (
          <div ref={setSlot} className="flex min-w-0 flex-1 items-center gap-2.5" />
        ) : (
          <div className={cn("min-w-0 flex-1", leading && "text-center")}>
            <h2 id={headingId} tabIndex={-1} className={cn("font-bold tracking-tight break-words text-foreground outline-none", TEXT.card)}>
              {title}
            </h2>
            {description && <p className={cn("text-muted-foreground", TEXT.note)}>{description}</p>}
          </div>
        )}
        {end != null && <div className="-mr-1 flex shrink-0 items-center">{end}</div>}
      </HeadRow>
      <CardId.Provider value={id}>
        <SheetCardHead.Provider value={head}>{children}</SheetCardHead.Provider>
      </CardId.Provider>
    </div>,
    target,
  );
}

/** The card's head row: pinned and frosted (PinnedHead), or for a screen
 *  reader alone where the card draws its own (`titleHidden`). */
function HeadRow({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  if (hidden) return <div className="sr-only flex shrink-0 items-center gap-2">{children}</div>;
  return <PinnedHead className="shrink-0">{children}</PinnedHead>;
}
