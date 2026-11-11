import { isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, useEffectEvent } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import { PinnedHead } from "./PinnedHead";
import TabKept from "./TabKept";
import { Dialog, DialogPortal } from "./ui/dialog";
import { holdOpenCard, setCardPill, type OpenCard, type PillHead } from "../lib/openCards";
import { SheetCardHead, useSheetCards } from "../lib/sheetCards";
import { TEXT } from "../lib/text";
import { sheetScroller } from "../lib/scrollPlace";

/**
 * A card in the map's panel on a phone, opened from anywhere on the page:
 * a control's (ResponsivePopover's -- the Map settings, the approaches, an
 * airplane's form) or a thing tapped on the chart (the map's openCard -- a
 * checkpoint, a VFR waypoint, a TFR). Each was a sheet floating over the
 * panel, or a popup over the chart, two more surfaces over the one
 * the pilot already had; at the owner's ask ("Yes to all, let's have
 * consistency and common code", 2026-10-27) they are cards in the panel,
 * as Maps opens a place's card in its one sheet.
 *
 * Drawn where the caller is, in React's tree, so what it reads from its
 * providers stays the same; put on the page in the panel's body
 * (SheetCardHost, MapPanel), over the tab or card that is there, which is
 * kept as it was for when this is put away. The last opened on top: one
 * opened from another (a hold from the procedures) covers it, and its
 * close goes back to it.
 */

/** Where the panel's body takes the cards: under the panel's head, the
 *  body's whole room, while one is open. */
export function SheetCardHost({ shown }: { shown: boolean }) {
  return <div ref={hostRef} data-sheet-cards="" className={shown ? "flex min-h-0 flex-1 flex-col print:hidden" : "hidden"} />;
}

/** One function, so React does not take the host away and put it back at
 *  each of the panel's renders, the cards in it with it. */
function hostRef(node: HTMLDivElement | null) {
  useSheetCards.setState({ host: node });
  return () => useSheetCards.setState((s) => (s.host === node ? { host: null } : s));
}

export function SheetCard({
  title,
  titleHidden = false,
  description,
  leading,
  action,
  closeButton,
  onClose,
  raise = "half",
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
  raise?: "half" | "full";
  testId?: string;
  /** Where the focus goes back to as it is put away: the control that
   *  opened it, where that is known. */
  returnFocus?: () => HTMLElement | null;
  /** Where the focus goes as it opens and as it goes, as Base UI's
   *  dialog takes them; by default its name, and back to `returnFocus`. */
  initialFocus?: DialogPrimitive.Popup.Props["initialFocus"];
  finalFocus?: DialogPrimitive.Popup.Props["finalFocus"];
  children: ReactNode;
}) {
  const id = useId();
  const headingId = `${id}-name`;
  const host = useSheetCards((s) => s.host);
  const top = useSheetCards((s) => s.stack.at(-1)?.id === id);
  const card = useRef<HTMLDivElement>(null);
  const named = useRef<HTMLHeadingElement>(null);
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
  // Opened anew, at its top (the one scrolling rule); a card under it keeps
  // its place for its return (TabKept).
  const startAtTop = useCallback((node: HTMLDivElement | null) => {
    card.current = node;
    if (node && !node.closest(".tab-away")) {
      const scroller = sheetScroller(node);
      if (scroller) scroller.scrollTop = 0;
    }
  }, []);
  // A close of the caller's own in the head (`action`, the app's
  // CloseButton): one that goes back a page first, the procedures'. With
  // the tab bar naming the card it is the bar's close that does it, and
  // the card draws no second one (the owner's screenshot, 2026-10-27: two
  // closes over the arrivals).
  const back = isValidElement<{ onClick?: () => void }>(action) && action.type === CloseButton ? action.props.onClick : undefined;
  // The caller's latest, for what is set up once as it opens; its raise
  // is what it opened with.
  const closeNow = useEffectEvent(() => onClose());
  const backNow = useEffectEvent(() => (back ?? onClose)());
  const raiseAtOpen = useEffectEvent(() => raise);

  // Open while it is drawn: on the panel's stack (the panel up for it, the
  // tab bar's name), and the top of what the bar's close, a swipe back and
  // a device's Back take away (lib/openCards), as every card's close is.
  useEffect(() => {
    const close = () => closeNow();
    useSheetCards.setState((s) => ({ stack: [...s.stack, { id, raise: raiseAtOpen(), close }] }));
    // Back one: a page of the card's first where it has one (`back`).
    const entry: OpenCard = { close: () => backNow(), pill: pillGiven.current };
    held.current = entry;
    const release = holdOpenCard(entry);
    return () => {
      held.current = null;
      release();
      useSheetCards.setState((s) => ({ stack: s.stack.filter((entry) => entry.id !== id) }));
    };
  }, [id]);
  useEffect(() => {
    useSheetCards.setState((s) => ({
      stack: s.stack.map((entry) => (entry.id === id && entry.title !== title ? { ...entry, title } : entry)),
    }));
  }, [id, title]);

  // The name in its own head row, where the content draws it (a map
  // card's, MapCard).
  const head = useMemo(() => (title === undefined ? { slot, headingId, setPill } : null), [title, slot, headingId, setPill]);
  if (!host) return null;
  // Its own close at its head's end, the tabs over it being the page's,
  // not the card's (TabBar); or the caller's action in its place.
  const end =
    (closeButton ?? (action === undefined && !leading)) ? (
      <CloseButton onClick={onClose} data-back="" data-testid="sheet-card-close" />
    ) : (
      action
    );
  // The focus to its name as it opens, which a screen reader then reads
  // -- after the frame, its name drawn in the head by then where the
  // content draws it -- unless the caller says where (a search's field).
  const toName = () => {
    requestAnimationFrame(() => card.current?.querySelector<HTMLElement>(`[id="${headingId}"]`)?.focus({ preventScroll: true }));
    return false;
  };
  // And back to what opened it as it is put away, once what it covered is
  // back (the control may have been under it), unless the focus has gone
  // somewhere of its own since.
  const toOpener = () => {
    const opener = returnFocus?.();
    const at = document.activeElement;
    const free = !at || at === document.body || !at.isConnected || !!card.current?.contains(at);
    return opener?.isConnected && free ? opener : false;
  };
  return (
    // Base UI's dialog, not modal: Escape and a tap on the chart put it
    // away, its focus in and out, and nothing else on the page put out of
    // reach -- no trap, nothing hidden from VoiceOver, the map live under
    // it. Open while it is drawn; the caller puts it away by drawing it no
    // more.
    <Dialog
      open
      modal={false}
      onOpenChange={(open, details) => {
        if (open) return;
        // The focus going elsewhere -- the panel, the map -- leaves it
        // open: the card is no modal.
        if (details.reason === "focus-out") return details.cancel();
        // A tap on the chart puts them away, as a tap outside the sheets
        // they were put away -- what the tap opens is what shows, where it
        // opened under them out of sight. Not the map's own buttons, nor
        // the panel, its tab bar or anything else on the page.
        if (details.reason === "outside-press") {
          const at = details.event.target instanceof Element ? details.event.target : null;
          if (!at?.closest(".maplibregl-map") || at.closest("[data-map-controls], .maplibregl-ctrl")) return details.cancel();
        }
        // Escape puts the top one away, ahead of the panel's own Escape
        // (which lowers it) as the default is then prevented: back a page
        // of the card's first where it has one. A menu open in it is a
        // layer over it and closes first.
        if (details.reason === "escape-key" && back) {
          details.cancel();
          details.event.preventDefault();
          back();
          return;
        }
        onClose();
      }}
    >
      <DialogPortal container={host} className="contents">
        {/* Under one opened over it, kept as it was and out of sight, for the
        close to come back to, as a tab is kept (TabKept). */}
        <TabKept away={!top}>
          {/* A labelled region, as Setup's layer is, not a dialog: nothing else
        on the page is put out of reach while it is open. Laid out whole in
        the sheet's one scroller as PanelCard is, from the panel's corner
        (its close where every card's is), at its top as it opens. */}
          <DialogPrimitive.Popup
            role="region"
            aria-labelledby={headingId}
            aria-describedby={undefined}
            initialFocus={initialFocus ?? toName}
            finalFocus={finalFocus ?? toOpener}
            ref={startAtTop}
            data-testid={testId}
            data-sheet-card=""
            className="relative shrink-0 px-4 pt-(--pinned-room) pb-[max(1rem,env(safe-area-inset-bottom))] [--pinned-room:var(--corner-inset,0.75rem)]"
            render={<section />}
          >
            {/* Its name at the left at a card's size and the close at the right
          end of its row, as CardHead sets a place's; a form's Cancel and
          Save at the two ends, the name between them: one row pinned at the
          sheet's top, the card scrolling under it (PinnedHead; the owner,
          2026-11-10). */}
            <HeadRow hidden={titleHidden}>
              {leading}
              {title === undefined ? (
                <div ref={setSlot} className="flex min-w-0 flex-1 items-center gap-2.5" />
              ) : (
                <div className={cn("min-w-0 flex-1", leading && "text-center")}>
                  <h2
                    ref={named}
                    id={headingId}
                    tabIndex={-1}
                    className={cn("font-bold tracking-tight break-words text-foreground outline-none", TEXT.card)}
                  >
                    {title}
                  </h2>
                  {description && <p className={cn("text-muted-foreground", TEXT.note)}>{description}</p>}
                </div>
              )}
              {end != null && <div className="-mr-1 flex shrink-0 items-center">{end}</div>}
            </HeadRow>
            <SheetCardHead.Provider value={head}>{children}</SheetCardHead.Provider>
          </DialogPrimitive.Popup>
        </TabKept>
      </DialogPortal>
    </Dialog>
  );
}

/** The card's head row: pinned and frosted (PinnedHead), or for a screen
 *  reader alone where the card draws its own (`titleHidden`). */
function HeadRow({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  if (hidden) return <div className="sr-only flex shrink-0 items-center gap-2">{children}</div>;
  return <PinnedHead className="shrink-0">{children}</PinnedHead>;
}
