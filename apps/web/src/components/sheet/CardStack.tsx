import { useCallback, useEffect, useLayoutEffect, type CSSProperties, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { PILL_RADIUS, type PanelState } from "../../lib/mapChrome";
import { closeTopCard } from "../../lib/openCards";
import { cardOpening, coverCard, dropCard, setCard, useSheetCards, type CardEntry } from "../../lib/sheetCards";
import { AT_PILL, letGo, snapsOf } from "./insets";
import { UNDER_INDICATOR } from "./SheetDrawer";
import { cardSettled, frontOffset, sheetTopRef, useRidingCard } from "./sheetTopSlot";
import { SheetViewport } from "./SheetViewport";

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
}

/** A card's drag eased on the Drawer's own curve, never under a finger;
 *  its fade as it is put away on the same time. */
const EASE =
  "transition-[transform,opacity] duration-(--motion-drawer) ease-(--motion-drawer-ease) data-swiping:transition-none motion-reduce:transition-none";

/**
 * A card comes up where the front sheet's top is -- the sheet's, or the
 * card's under it that the map's buttons ride -- and eases from there to
 * its own size, as Apple Maps' place card takes over its sheet at the
 * height the sheet is: its popup placed there while the Drawer marks it
 * starting (--card-from, the front's own snap offset as the card opened,
 * less the sheet's offset it is drawn in, --sheet-base, SheetDrawer). So
 * the map's buttons ride its top from its first frame and only glide if
 * its height changes (sheetTopSlot). It rose from the screen's foot once,
 * Base UI's Snap points demo's entry, and the buttons gave way while it
 * slid (the owner's iPhone, 2026-11-13: they "redraw" at every card).
 * Base UI writes --drawer-snap-point-offset as 0 until it has measured, so
 * with no starting place a new card was drawn all the way up and slid
 * down to half (the owner, 2026-11-11). Put away, it fades where it is,
 * the sheet's content fading back in under it (SheetDrawer's GIVE_WAY).
 *
 * Base UI plays that entry only for a drawer that opens after it has
 * mounted; one mounted already open is drawn where it rests from its first
 * frame (its useTransitionStatus), which before it has measured itself is
 * all the way up. Every card opened anew -- a tap on the chart, a place, a
 * NOTAM -- mounted open, and came in at the top and dropped to half (the
 * owner's iPhone, 2026-11-12, TFR 6/2478; in WebKit at 390x844 its top at
 * 8 px in its first frame, then easing down to 476). So a card's drawer
 * opens the render after its size is set (CardDrawer's `open`), and is
 * never drawn anew after that (CardStack).
 */
const RISE =
  "data-starting-style:[transform:translateY(calc(var(--card-from,var(--sheet-base,0px))_-_var(--sheet-base,0px)))] data-ending-style:opacity-0";

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
 * sizes its own drawer"), its entry's `at`: it opens at half, every card
 * (cardOpening; Emergency alone all the way up), then where the pilot
 * drags it or the card asks (useCardSize). The sheet under
 * it, and each card under it, stay at their own. Put on the page inside the
 * sheet's popup (`host`), so a card is in the sheet for what looks for it
 * there (the browser tests, index.css), and placed from the sheet's snap
 * offset to its own. The keyboard's inset is the Drawer's own
 * (VirtualKeyboardProvider).
 *
 * Every card's drawer has one place in React's tree for its life: side by
 * side, by its id, in one Drawer of their own (`Cards`), whatever opens,
 * closes, is kept or raised over or under it. They were nested each in
 * the one under it, and a card kept was drawn beside them, so a card
 * going from under another, or to or from kept, gave the drawers over it
 * another parent, and React drew them anew: a card opened over another
 * was drawn all the way up for a frame, and one kept was drawn anew
 * closed, gone with no close, the map's buttons thrown off the screen's
 * top (the flicker audit, 2026-11-14, FL-1 and FL-2). Side by side they
 * cannot tell the sheet themselves: a Drawer tells its parent how many
 * are open over it by setting, not adding (useDialogRoot's
 * onNestedDialogOpen; @base-ui/react 1.9.0, the newest), and a closed one
 * tells it nothing, so the last card to speak won and the sheet thought
 * none was up with one still open -- its swipe the sheet's
 * (DrawerViewport), its content shown under the card
 * (data-nested-drawer-open). Their Drawer, open while any card is, is
 * what the sheet hears: one nested drawer up. Raised, a card's portal is
 * put last in the sheet's popup, over the rest (useStackOrder).
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
  const cover = coverCard(stack)?.id;
  return (
    <Cards open={top !== undefined}>
      {stack.map((entry) => (
        <CardDrawer
          key={entry.id}
          entry={entry}
          top={entry.id === top}
          cover={entry.id === cover}
          riding={entry.id === riding}
          {...p}
          host={host}
        />
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
  cover,
  riding,
  host,
  ...p
}: StackProps & { entry: CardEntry; top: boolean; cover: boolean; riding: boolean; host: HTMLElement }) {
  const { id, frame } = entry;
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
  // Its own snap point, kept in its entry: set as it opens, from then on
  // the pilot's or the card's (useCardSize).
  const at = entry.at ?? cardOpening(entry);
  const unset = entry.at === undefined && entry.state === "open";
  // With where the front sheet's top is as it opens, where it comes up (RISE).
  useLayoutEffect(() => {
    if (unset) setCard(id, { at, from: frontOffset() });
  }, [unset, id, at]);
  const ask = useCallback((size: PanelState) => setCard(id, { at: size }), [id]);
  // Gone, it is no longer up (the map's room, map/cardRoom).
  useEffect(() => () => cardSettled(id, false), [id]);
  // A settings card swiped down closes from half or below; from all the way
  // up it comes down to half, the Drawer's own next snap point, and stays
  // open (the owner, 2026-11-14: "Settings cards should only close from a
  // swipe down when in medium detents").
  const swipeCloses = !!frame.onSwipeClose && at !== "full";
  // A drag let go (letGo): the top card's alone; a card under it refuses a close.
  const snapped = (point: Drawer.Root.SnapPoint | null, details: Drawer.Root.SnapPointChangeEventDetails) => {
    if (top)
      letGo(point, details, {
        fromBottom,
        at,
        ask,
        park: frame.onSwipeClose ? "half" : "peek",
        close: swipeCloses ? frame.onSwipeClose : undefined,
      });
    else if (point === null) details.cancel();
  };
  const topSlot = onPhone && fromBottom && riding;
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
        if (!top || details.reason === "focus-out") return details.cancel();
        // A swipe past the pill is no close: the card stays at the pill
        // with its title row (the card rule's 10) -- but a settings card's
        // at half, which closes, the Drawer's own close carrying it down;
        // all the way up, it comes down to half.
        if (details.reason === "swipe" && swipeCloses) {
          frame.onSwipeClose?.();
          return;
        }
        if (details.reason === "swipe") {
          details.cancel();
          ask(frame.onSwipeClose ? "half" : "peek");
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
              role="region"
              aria-label={frame.label}
              aria-labelledby={frame.label ? undefined : frame.labelledBy}
              aria-describedby={undefined}
              initialFocus={frame.initialFocus ?? false}
              finalFocus={frame.finalFocus ?? false}
              data-testid={frame.testId}
              data-sheet-card=""
              data-panel={at}
              // The card that covers the map most, not always the top one,
              // for what it covers of the map (useSheetCover, coverCard).
              data-cover={cover || undefined}
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
                // drawn in (--sheet-base, SheetDrawer). Copied for what is
                // inside (SheetParts' FOLLOW): Base UI's own do not inherit.
                onPhone &&
                  "[transform:translateY(calc(var(--drawer-snap-point-offset)-var(--sheet-base,0px)+var(--drawer-swipe-movement-y)))] [--sheet-offset:var(--drawer-snap-point-offset)] [--sheet-swipe:var(--drawer-swipe-movement-y)]",
                onPhone && p.ready && EASE,
                // Gone with its content: closed at once, an empty card never slid down.
                onPhone && (entry.state === "leaving" ? "transition-none data-ending-style:opacity-0" : RISE),
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
              <div className="flex min-h-0 flex-1 flex-col overflow-clip rounded-[inherit]">
                <CardScroller {...p} pill={onPhone && at === "peek"} raise={() => ask("half")} slot={slot} />
              </div>
              {!(onPhone && fromBottom) && top && p.grabber(at, ask)}
            </Drawer.Popup>
          </SheetViewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
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
}: StackProps & { slot: (node: HTMLElement | null) => void; pill: boolean; raise: () => void }) {
  return (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions -- a pointer convenience, not a control: the grabber is the keyboard's way to raise the sheet, and the card's own buttons stay focusable
    <div
      onClick={
        pill
          ? (event) => {
              if (!(event.target instanceof Element) || !event.target.closest("button, a, input, [role=button]")) raise();
            }
          : undefined
      }
      className="flex min-h-0 flex-1 flex-col"
      style={{ "--sheet-head": "0px" } as CSSProperties}
    >
      <Drawer.Content
        ref={slot}
        data-sheet-scroll=""
        data-panel-body=""
        className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto print:overflow-visible", below, pill && AT_PILL)}
      />
    </div>
  );
}
