import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { PILL_RADIUS, type PanelState } from "../../lib/mapChrome";
import { closeTopCard } from "../../lib/openCards";
import { cardOpening, dropCard, openedFrom, setCard, useSheetCards, type CardEntry } from "../../lib/sheetCards";
import { AT_PILL, letGo, snapsOf } from "./insets";
import { EASE, FROM_BELOW, FROM_EDGE, RISE, SIDE_EASE } from "./cardMotion";
import { UNDER_INDICATOR } from "./SheetDrawer";
import { GRABBER_FOOT_ROOM } from "./SheetGrabber";
import { cardSettled, frontOffset, frontUnder, sheetTopRef, useRidingCard } from "./sheetTopSlot";
import { SheetViewport } from "./SheetViewport";
import { PointerTapDiv } from "./PointerTapDiv";
import { tapOpens } from "./sheetLayout";
import { useCardScrollRoom } from "./cardScrollRoom";
import { CardFootSlot } from "./CardFoot";
import { inCardFoot, useCardFootHeight } from "./cardFeet";
import { usePopupStill } from "./sheetMotion";

export interface StackProps {
  /** A phone's sheet: the cards are drawers with its sizes and its swipe.
   *  Else the side panel's: each covers the panel, nothing to swipe. */
  onPhone: boolean;
  fromBottom: boolean;
  /** Eased only once the sheet has been drawn where it rests (useDrawn). */
  ready: boolean;
  /** The top card's grabber (SheetGrabber, the plain one), for its own size. */
  grabber: (size: PanelState, ask: (size: PanelState) => void) => ReactNode;
  /** The card look: the sheet's own. */
  look: string;
  /** Under the body's glass, the shade the sheet's body has (SheetParts). */
  below: string;
  /** From `md` up, the cards in the inspector's column at the map's right
   *  (MapPanel), not over the side panel: they come in from its edge. */
  inspector?: boolean;
}

/**
 * The cards over the map's sheet, each Base UI's own nested Drawer (the
 * owner, 2026-11-11: "Yes", the stock Drawer's nested drawers in place of
 * the hand-built card stack), stacked over the sheet as Apple Maps stacks
 * its cards, the last opened on top. Drawn in the sheet's own Drawer, so
 * each is its nested drawer: while one is open the sheet's swipe is the
 * card's, Escape is the card's (the top one's), and the sheet under it is
 * left where it was -- its size, its search, its list and its place in it.
 *
 * Each card has its own snap point among the sheet's three sizes (the
 * owner, 2026-11-11: "Just let the drawer do what it does"; "each card
 * sizes its own drawer"), its entry's `at`: it opens at the size of the
 * card it is opened from, else at half (cardOpening; Emergency all the way
 * up), then where the pilot drags it or the card asks (useCardSize). The sheet under
 * it, and each card under it, stay at their own. Put on the page inside the
 * sheet's popup (`host`), so a card is in the sheet for what looks for it
 * there (the browser tests, index.css), and placed from the sheet's snap
 * offset to its own. The keyboard's inset is the Drawer's own
 * (VirtualKeyboardProvider).
 *
 * Every card's drawer has one place in React's tree for its life: side by
 * side, by its id, in one Drawer of their own (`Cards`), whatever opens,
 * closes, is kept or raised over or under it, so React never draws one
 * anew with another parent (a card drawn all the way up for a frame, one
 * kept drawn anew closed).
 * Side by side they cannot tell the sheet themselves -- a Drawer tells its
 * parent how many are open over it by setting, not adding (useDialogRoot's
 * onNestedDialogOpen; @base-ui/react 1.9.0), so the last card to speak
 * would win -- so their Drawer, open while any card is, is what the sheet
 * hears: one nested drawer up. Raised, a card's portal is put last in the
 * sheet's popup, over the rest (useStackOrder).
 */
export function CardStack(p: StackProps & { host: HTMLElement | null }) {
  const stack = useSheetCards((s) => s.stack);
  const riding = useRidingCard();
  useStackOrder(
    p.host,
    stack.map((entry) => entry.id),
  );
  if (!p.host) return null;
  const host = p.host;
  const top = [...stack].reverse().find((entry) => entry.state === "open")?.id;
  return (
    <Cards open={top !== undefined}>
      {stack.map((entry) => (
        <CardDrawer key={entry.id} entry={entry} top={entry.id === top} riding={entry.id === riding} {...p} host={host} />
      ))}
    </Cards>
  );
}

/**
 * The cards' portals in the sheet's popup in the stack's order, the top
 * card's last, so it is drawn over the rest and is what the page finds
 * last (the browser tests' front sheet): a portal stays where its drawer
 * first put it, and a card raised -- You opened again from the Map card's
 * gear -- came up under the cards opened after it. The portal's element
 * moved, not its drawer: React draws nothing anew.
 */
function useStackOrder(host: HTMLElement | null, ids: string[]) {
  const order = ids.join("\n");
  useLayoutEffect(() => {
    if (!host) return;
    const portals = order.split("\n").map((id) => {
      let node = [...host.querySelectorAll("[data-card-viewport]")].find((n) => n.getAttribute("data-card-viewport") === id) ?? null;
      while (node && node.parentElement !== host) node = node.parentElement;
      return node;
    });
    const placed = portals.filter((node): node is Element => !!node);
    const now = [...host.children].filter((node) => placed.includes(node));
    if (now.some((node, i) => node !== placed[i])) for (const node of placed) host.appendChild(node);
  }, [host, order]);
}

/**
 * The cards' own Drawer, nested in the sheet's: open while any card is, so
 * the sheet hears one drawer up over it whichever cards open and close
 * under its children (CardStack). It has no popup of its own, nothing to
 * swipe or close: Escape, a tap outside, are its cards' (each card is its
 * nested drawer, which Base UI gives them first) and refused here.
 */
function Cards({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <Drawer.Root
      open={open}
      modal={false}
      disablePointerDismissal
      onOpenChange={(next, details) => {
        if (!next) details.cancel();
      }}
    >
      {children}
    </Drawer.Root>
  );
}

function CardDrawer({
  entry,
  top,
  riding,
  host,
  ...p
}: StackProps & { entry: CardEntry; top: boolean; riding: boolean; host: HTMLElement }) {
  const { id, frame } = entry;
  // Its popup, for where it goes back down to as it closes.
  const [popup, setPopup] = useState<HTMLElement | null>(null);
  // The card's own content box taken into this drawer's scroller (useCardFrame).
  const content = entry.host;
  const slot = useCallback(
    (node: HTMLElement | null) => {
      if (node && content.parentElement !== node) node.append(content);
      setCard(id, { slot: node });
    },
    [id, content],
  );
  const { onPhone, fromBottom } = p;
  // The sheet's own snap points, the same constant values (sheet/insets).
  const snaps = snapsOf(fromBottom);
  // Its own snap point, kept in its entry: set as it opens, at the size of
  // the card it is opened from (cardOpening), from then on the pilot's or
  // the card's (useCardSize).
  const unset = entry.at === undefined && entry.state === "open";
  const from = useSheetCards((s) => (unset ? openedFrom(s.stack, id) : undefined));
  const at = entry.at ?? cardOpening(entry, from);
  // With where the front sheet's top is as it opens, where it comes up (RISE).
  useLayoutEffect(() => {
    if (unset) setCard(id, { at, from: frontOffset() });
  }, [unset, id, at]);
  // Closing (put away, or its caller gone), where it goes back down to
  // (RISE): the top of the sheet that will be in front once it is gone;
  // swiped away, the screen's foot, on down from where the finger let go.
  const closing = entry.state !== "open";
  const swiped = useRef(false);
  useLayoutEffect(() => {
    if (!closing || !popup) return;
    popup.style.setProperty(
      "--card-to",
      swiped.current ? `calc(${popup.offsetHeight}px + var(--sheet-base, 0px))` : (frontUnder(id) ?? ""),
    );
    swiped.current = false;
  }, [closing, popup, id]);
  const ask = useCallback((size: PanelState) => setCard(id, { at: size }), [id]);
  // Gone, it is no longer up (the map's room, map/cardRoom).
  useEffect(() => () => cardSettled(id, false), [id]);
  // Every card swiped down from half closes, as its ✕ does: the top card's
  // close (lib/openCards), so a form with an edit still asks first; the
  // main sheet alone, Search and FPL, stays at its pill (the owner,
  // 2026-11-26). From all the way up a swipe brings it to half, the
  // Drawer's next snap point, and it stays open (the owner, 2026-11-14).
  const swipeCloses = at !== "full";
  const swipeClose = () => {
    swiped.current = true;
    closeTopCard();
  };
  // A drag let go (letGo): the top card's alone; a card under it refuses a close.
  const snapped = (point: Drawer.Root.SnapPoint | null, details: Drawer.Root.SnapPointChangeEventDetails) => {
    if (top) letGo(point, details, { fromBottom, at, ask, park: "half", close: swipeCloses ? swipeClose : undefined });
    else if (point === null) details.cancel();
  };
  const topSlot = onPhone && fromBottom && riding;
  // Its tab bar's slot at the screen's foot, in sight while it is the top
  // card and open, through every drag and slide, as FPL's foot bar is
  // (sheet/FootBar): out of sight only once the card rests at the pill
  // (usePopupStill), so a drag or a size tap never blinks it.
  const restsAtPill = usePopupStill(popup, at === "peek");
  const footShown = top && entry.state === "open" && entry.at !== undefined && !restsAtPill;
  const footPx = useCardFootHeight(id);
  return (
    <Drawer.Root
      // Mounted closed, opened once its size is set (the layout effect
      // above, before the first paint): so it comes up from the front's top
      // (RISE) at its own size.
      open={entry.state === "open" && entry.at !== undefined}
      modal={false}
      swipeDirection={fromBottom ? "down" : "up"}
      snapPoints={onPhone ? snaps.points : undefined}
      snapToSequentialPoints
      snapPoint={onPhone ? snaps.at[at] : undefined}
      onSnapPointChange={snapped}
      // Up: the map may bring what was tapped into sight (map/cardRoom).
      onOpenChangeComplete={(open) => {
        cardSettled(id, open);
        if (!open && entry.state === "leaving") dropCard(id);
      }}
      onOpenChange={(open, details) => {
        if (open) return;
        // The card on top alone hears it, as Base UI gives Escape to the
        // topmost of nested drawers; kept here for a tap or a swipe.
        // The focus going elsewhere -- the sheet, the map -- leaves it
        // open: it is no modal.
        // A tap on its tab bar, in its foot slot beside it (sheet/CardFoot), is not outside it.
        if (!top || details.reason === "focus-out" || (details.reason === "outside-press" && inCardFoot(details.event.target)))
          return details.cancel();
        // The Drawer's own close carries a card swiped from half down;
        // all the way up, it comes down to half.
        if (details.reason === "swipe" && swipeCloses) return swipeClose();
        if (details.reason === "swipe") {
          details.cancel();
          ask("half");
          return;
        }
        if (frame.dismiss) return frame.dismiss(details);
        details.cancel();
        // Escape closes the top card, a level back, as a device's Back does
        // (lib/openCards), unless something took the key first (a desktop's
        // shortcuts); taken, so the Back's Escape (lib/backNavigation) goes
        // no further.
        if (details.reason !== "escape-key" || details.event.defaultPrevented) return;
        if (closeTopCard()) details.event.preventDefault();
      }}
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal container={host} keepMounted>
          {/* Over the sheet's whole popup, above the keyboard while it is up,
              no target itself: the card is. */}
          <SheetViewport
            data-card-viewport={id}
            className="pointer-events-none absolute inset-x-0 top-0 z-40 print:static"
            style={{ bottom: "var(--drawer-keyboard-inset, 0px)" }}
          >
            <Drawer.Popup
              ref={setPopup}
              role="region"
              aria-label={frame.label}
              aria-labelledby={frame.label ? undefined : frame.labelledBy}
              aria-describedby={undefined}
              initialFocus={frame.initialFocus ?? false}
              finalFocus={frame.finalFocus ?? false}
              data-testid={frame.testId}
              data-sheet-card=""
              data-panel={at}
              // The side panel's card does not swipe: no sizes to swipe
              // between. Nor does a card under the top one: the top card's
              // nested drawers took that from it once (CardStack).
              data-base-ui-swipe-ignore={onPhone && top ? undefined : ""}
              // Its corners the sheet's: drawn outside the sheet's clip, so it can stand over it.
              style={
                onPhone
                  ? ({ borderRadius: `${PILL_RADIUS}px ${PILL_RADIUS}px 0 0`, "--card-from": entry.from } as CSSProperties)
                  : undefined
              }
              className={cn(
                "group/sheet pointer-events-auto absolute inset-0 flex flex-col text-foreground outline-none print:static",
                p.look,
                // Its own snap offset and drag, from the sheet's offset it is
                // drawn in (--sheet-base, SheetDrawer). Its offset copied for
                // what is inside (a card's room, ProfileCard, PastFlightCard):
                // Base UI's own does not inherit.
                onPhone &&
                  "[transform:translateY(calc(var(--drawer-snap-point-offset)-var(--sheet-base,0px)+var(--drawer-swipe-movement-y)))] [--sheet-offset:var(--drawer-snap-point-offset)]",
                onPhone && p.ready && EASE,
                // Its content kept in sight as it goes, its caller gone too
                // (useCardFrame's keepFace), so it closes as any card does.
                onPhone && RISE,
                !onPhone && p.ready && cn(SIDE_EASE, p.inspector ? FROM_EDGE : FROM_BELOW),
                onPhone && fromBottom && UNDER_INDICATOR,
              )}
            >
              {/* The map's buttons ride its top, as the sheet's (OnSheetTop), from its first frame. */}
              {topSlot && (
                <div
                  ref={sheetTopRef}
                  data-sheet-top=""
                  data-base-ui-swipe-ignore=""
                  className="pointer-events-none absolute inset-x-0 bottom-full"
                />
              )}
              {onPhone && fromBottom && top && p.grabber(at, ask)}
              {/* Its scroller ends over the grabber's box where the grabber is
                  at the foot (the side panel, a top sheet), so a row scrolled
                  to the foot is not under the box: the iOS audit's P1 found
                  "plates-row" and a nav log row there, lost 3 to the grabber.
                  Only where the grabber is drawn, the card on top: one under
                  another, or kept mounted, kept 16 empty points at its foot, and the two rules now stay in step. */}
              <div
                className={cn(
                  "flex min-h-0 flex-1 flex-col overflow-clip rounded-[inherit]",
                  !(onPhone && fromBottom) && top && !p.inspector && GRABBER_FOOT_ROOM,
                )}
              >
                <CardScroller {...p} pill={onPhone && at === "peek"} raise={() => ask("half")} slot={slot} footPx={footPx} />
              </div>
              {!(onPhone && fromBottom) && top && p.grabber(at, ask)}
            </Drawer.Popup>
          </SheetViewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
      {onPhone && fromBottom && <CardFootSlot id={id} shown={footShown} />}
    </Drawer.Root>
  );
}

/**
 * A card's one scroller, the Drawer's own content (a mouse's drag there
 * selects words, a finger's moves the sheet), where the card's content is
 * put. At the pill its title row alone is in sight (data-sheet-head, the
 * card rule's 10), the rest of it hidden and out of the keyboard's reach,
 * and a tap on the row brings the card back to half.
 */
function CardScroller({
  slot,
  pill,
  raise,
  below,
  footPx,
}: StackProps & { slot: (node: HTMLElement | null) => void; pill: boolean; raise: () => void; footPx: number }) {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const placed = useCallback(
    (node: HTMLElement | null) => {
      slot(node);
      setScroller(node);
    },
    [slot],
  );
  useCardScrollRoom(scroller, footPx);
  return (
    <PointerTapDiv
      onClick={pill ? (event) => tapOpens(event, raise) : undefined}
      className="flex min-h-0 flex-1 flex-col"
      style={{ "--sheet-head": "0px" } as CSSProperties}
    >
      <Drawer.Content
        ref={placed}
        data-sheet-scroll=""
        data-panel-body=""
        // What is scrolled into sight comes to rest clear of the card's
        // pinned head, a focused control included (WCAG 2.4.11): its
        // measured height (useCardScrollRoom), this its room till then.
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto scroll-pt-[calc(var(--corner-inset,0.75rem)+3.5rem)] print:overflow-visible",
          below,
          pill && AT_PILL,
        )}
      />
    </PointerTapDiv>
  );
}
