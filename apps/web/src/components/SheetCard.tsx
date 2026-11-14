import { isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, useEffectEvent } from "react";
import { createPortal } from "react-dom";
import { EngineGate } from "../lib/engine/engineGate";
import type { Drawer } from "@base-ui/react/drawer";
import CloseButton from "./CloseButton";
import { CardHeadRow } from "./CardHead";
import { HeadGrid } from "./HeadGrid";
import { PinnedHead } from "./PinnedHead";
import { useCardFrame } from "./sheet/useCardFrame";
import { holdOpenCard, setCardPill, type OpenCard, type PillHead } from "../lib/openCards";
import { CardId, SheetCardHead, type CardFrame } from "../lib/sheetCards";

/**
 * The app's one card (the card rule's 8; the owner, 2026-11-11: "Are we
 * using two different cards?" -- PanelCard is merged into it): a card over
 * the map's sheet, opened from anywhere on the page: a control's
 * (ResponsivePopover's -- the Map settings, the approaches, an airplane's
 * form), a thing tapped on the chart (the map's openCard -- a checkpoint, a
 * VFR waypoint, a TFR), or a place's or a list's whose content draws its
 * own head with the same head row (`head={false}`: an airport, an
 * airspace, traffic, a past flight, Nearest; CardHead, CardTitle). Each was a sheet floating over the
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
  head = true,
  dismiss: ownDismiss,
  title,
  titleHidden = false,
  description,
  leading,
  action,
  closeButton,
  onClose,
  fullScreen = false,
  swipeCloses = false,
  cardId,
  testId,
  returnFocus,
  initialFocus,
  finalFocus,
  children,
}: {
  /** Its head row drawn here from its name, Cancel, Save and close; false
   *  where its content draws the same row itself (CardHead, CardTitle),
   *  which holds its close for Back, and a tap on the chart is the
   *  chart's to decide (it opens what was tapped). */
  head?: boolean;
  /** What its drawer tells it, in place of its own way: Nearest lowering
   *  itself on a tap on the chart. */
  dismiss?: CardFrame["dismiss"];
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
  /** Its close; none where its content's own head closes it (`head`). */
  onClose?: () => void;
  /** Emergency, the one card all the way up as it opens (the card rule's 4);
   *  every other card opens at half. */
  fullScreen?: boolean;
  /** A settings card (the Map card): a swipe down from half closes it, as
   *  its ✕ does, and from all the way up brings it to half, where a content
   *  card parks at the pill (CardStack). */
  swipeCloses?: boolean;
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
  const [startSlot, setStartSlot] = useState<HTMLElement | null>(null);
  // A close of the caller's own in the head (`action`, the app's
  // CloseButton): one that goes back a page first, the procedures'. With
  // the tab bar naming the card it is the bar's close that does it, and
  // the card draws no second one (the owner's screenshot, 2026-10-27: two
  // closes over the arrivals).
  const back = isValidElement<{ onClick?: () => void }>(action) && action.type === CloseButton ? action.props.onClick : undefined;
  // The caller's latest, for what is set up once as it opens.
  const backNow = useEffectEvent(() => (back ?? onClose)?.());

  // The top of what the bar's close, a swipe back and a device's Back take
  // away (lib/openCards), as every card's close is: back one, a page of the
  // card's first where it has one (`back`).
  useEffect(() => {
    // Its content's head holds it where it draws one (CardHead, CardTitle).
    if (!head) return;
    const entry: OpenCard = { close: () => backNow(), pill: pillGiven.current };
    held.current = entry;
    const release = holdOpenCard(entry);
    return () => {
      held.current = null;
      release();
    };
  }, [head]);

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
    onClose?.();
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
  // The caller's place first; where it has none (`true`, Base UI's own
  // first control: the ✕, whose tooltip would then show as the card opens
  // and take the first Escape), the name.
  const opening: Drawer.Popup.Props["initialFocus"] =
    typeof initialFocus === "function"
      ? (type) => {
          const at = initialFocus(type);
          return at === true ? toName() : at;
        }
      : (initialFocus ?? toName);
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
    head
      ? {
          fullScreen,
          title,
          testId,
          labelledBy: headingId,
          dismiss,
          onSwipeClose: swipeCloses ? () => onClose?.() : undefined,
          initialFocus: opening,
          finalFocus: finalFocus ?? toOpener,
        }
      : // Its content's head names it; the focus left where it is unless
        // it came from the chart (fromMarker), the drawer's own Escape.
        { fullScreen, title, dismiss: ownDismiss, initialFocus, finalFocus },
    id,
  );
  const fromMarker = useFromMarker();

  // The name in its own head row, where the content draws it (a map
  // card's, MapCard).
  const headSlot = useMemo(
    () => (title === undefined ? { slot, startSlot, headingId, setPill } : null),
    [title, slot, startSlot, headingId, setPill],
  );
  if (!target) return null;
  if (!head)
    return createPortal(
      // Laid out whole in its drawer's scroller, its room over its first
      // line the grabber's (--pinned-room), which its pinned head reaches
      // up over; there at once as it opens, still while the sheet moves
      // round it (the owner: "Is the airport and aircraft card same
      // style?").
      <div
        ref={fromMarker}
        className="relative shrink-0 px-4 pt-(--pinned-room) pb-[max(1rem,env(safe-area-inset-bottom))] [--pinned-room:var(--corner-inset,0.75rem)] print:hidden"
        data-testid={testId}
      >
        <CardId.Provider value={id}>
          <EngineGate>{children}</EngineGate>
        </CardId.Provider>
      </div>,
      target,
    );
  // Its own close at its head's end; or the caller's action in its place.
  const end =
    (closeButton ?? (action === undefined && !leading)) ? (
      <CloseButton onClick={() => onClose?.()} data-back="" data-testid="sheet-card-close" />
    ) : (
      action
    );
  return createPortal(
    // Laid out whole in its drawer's scroller, from the sheet's corner (its
    // close where every card's is).
    <div className="relative shrink-0 px-4 pt-(--pinned-room) pb-[max(1rem,env(safe-area-inset-bottom))] [--pinned-room:var(--corner-inset,0.75rem)] print:hidden">
      {/* The one head row (CardHeadRow): its name at the left at a card's
          size and the close at the right end; a form's Cancel and Save at
          the two ends, the name between them; pinned at the card's top,
          the card scrolling under it (the owner, 2026-11-10). Where the
          content draws its name (a map card's, MapCard), its slot. */}
      {title === undefined ? (
        <CardHeadSlot slot={setSlot} startSlot={setStartSlot} leading={leading} end={end} />
      ) : (
        <CardHeadRow name={title} sub={description} nameId={headingId} leading={leading} wrap end={end} hidden={titleHidden} />
      )}
      <CardId.Provider value={id}>
        {/* A card's content waits for the engine (EngineGate), its head and
            grabber not: cards are kept drawn from the page's first paint
            (keepMounted), before the .wasm is in, and what they ask the
            engine as they draw threw there -- the Nav Log's totals, then the
            Brief's call sign (radio_call_sign), each "Part of the app didn't
            load" (the owner's iPhone and firstDraw.test, 2026-11-11). One
            gate for every card, not one per call. */}
        <SheetCardHead.Provider value={headSlot}>
          <EngineGate>{children}</EngineGate>
        </SheetCardHead.Provider>
      </CardId.Provider>
    </div>,
    target,
  );
}

/** The head row's room for a name its content draws (MapCard's mark and
 *  name), centred, the close at its end, as CardHeadRow's (HeadGrid); and
 *  at its start, after a form's Cancel, room for the card's Share
 *  (MapCard's `start`), where CardHeadRow has it. */
function CardHeadSlot({
  slot,
  startSlot,
  leading,
  end,
}: {
  slot: (node: HTMLDivElement | null) => void;
  startSlot: (node: HTMLSpanElement | null) => void;
  leading?: ReactNode;
  end?: ReactNode;
}) {
  return (
    <PinnedHead className="shrink-0">
      <HeadGrid
        start={
          <>
            {leading}
            {/* Laid out as the start's own children (contents), so a
                Share put here sits in the row as CardHeadRow's does. */}
            <span ref={startSlot} className="contents" />
          </>
        }
        middle={null}
        middleRef={slot}
        middleClassName="flex-row justify-center gap-2.5"
        end={end}
      />
    </PinnedHead>
  );
}

/** Opened from a marker on the chart with the keys (Enter on it), the
 *  focus to the card's name, which a screen reader then reads, and back to
 *  the marker as the card is put away -- where it stayed on the marker,
 *  the card a page away in the tab order and said by nothing. As it is put
 *  in its drawer: the focus where it is then is the marker's. */
function useFromMarker() {
  return useCallback((node: HTMLDivElement | null) => {
    const from = document.activeElement as HTMLElement | null;
    if (!node || !from?.closest(".maplibregl-map")) return;
    node.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    return () => {
      const at = document.activeElement;
      if (from.isConnected && (!at || at === document.body || node.contains(at))) from.focus({ preventScroll: true });
    };
  }, []);
}
