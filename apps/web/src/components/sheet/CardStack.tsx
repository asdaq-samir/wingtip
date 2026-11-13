import { useCallback, useEffect, useLayoutEffect, type CSSProperties, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { PILL_RADIUS, type PanelState } from "../../lib/mapChrome";
import { closeTopCard } from "../../lib/openCards";
import { cardOpening, coverCard, dropCard, setCard, useSheetCards, type CardEntry } from "../../lib/sheetCards";
import { AT_PILL, sizeAt, snapsOf } from "./insets";
import { UNDER_INDICATOR } from "./SheetDrawer";
import { cardSettled, sheetTopRef, useRidingCard } from "./sheetTopSlot";
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

/** A card's drag eased on the Drawer's own curve, never under a finger. */
const EASE =
  "transition-transform duration-(--motion-drawer) ease-(--motion-drawer-ease) data-swiping:transition-none motion-reduce:transition-none";

/**
 * A card rises from the screen's foot as it opens and slides back down as
 * it closes, as Base UI's own Snap points demo does: its popup off the
 * screen while the Drawer marks it starting or ending. Base UI writes
 * --drawer-snap-point-offset as 0 until it has measured, so with no
 * starting place a new card was drawn all the way up and slid down to half
 * (the owner, 2026-11-11: "a new card is always transition from full to
 * half when opening it"), and with no ending place it went in one frame.
 * Off the screen is the card's own height below where it is drawn, less the
 * sheet's offset it is drawn in (--sheet-base, SheetDrawer), past the home
 * indicator (a top sheet's: above it, past the status bar). The close's
 * time is the demo's: 400 ms at a still finger, shorter after a throw
 * (--drawer-swipe-strength).
 *
 * Base UI plays that entry only for a drawer that opens after it has
 * mounted; one mounted already open is drawn where it rests from its first
 * frame (its useTransitionStatus), which before it has measured itself is
 * all the way up. Every card opened anew -- a tap on the chart, a place, a
 * NOTAM -- mounted open, and came in at the top and dropped to half (the
 * owner's iPhone, 2026-11-12, TFR 6/2478; in WebKit at 390x844 its top at
 * 8 px in its first frame, then easing down to 476). So a card's drawer
 * opens the render after it mounts (CardDrawer's `open`).
 */
const SLIDE =
  "data-starting-style:[transform:translateY(calc(100%_-_var(--sheet-base,0px)_+_env(safe-area-inset-bottom)_+_2px))] data-ending-style:[transform:translateY(calc(100%_-_var(--sheet-base,0px)_+_env(safe-area-inset-bottom)_+_2px))] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]";

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
 * Each card up is nested in the one under it, in React's tree, as Base
 * UI's nested drawers demo nests them: a Drawer tells its parent how many
 * drawers are open over it by setting, not adding, so one parent takes
 * one child (useDialogRoot's onNestedDialogOpen, DrawerPopup's presence;
 * @base-ui/react 1.9.0, the newest). Drawn side by side in the sheet, the
 * cards each set the sheet's count, the last to speak winning: a card
 * closed over another left the sheet thinking none was open, or one was
 * after all had gone -- its swipe the sheet's (DrawerViewport), its
 * content shown or hidden under the card (data-nested-drawer-open). Nested
 * one in another, each card counts those over it and the sheet hears the
 * one under them all. A card kept closed (under a page put away) tells
 * its parent nothing, and would cut the chain: it is drawn beside it.
 */
export function CardStack(p: StackProps & { host: HTMLElement | null }) {
  const stack = useSheetCards((s) => s.stack);
  const riding = useRidingCard();
  if (!p.host) return null;
  const host = p.host;
  const top = [...stack].reverse().find((entry) => entry.state === "open")?.id;
  const cover = coverCard(stack)?.id;
  const drawer = (entry: CardEntry, over?: ReactNode) => (
    <CardDrawer
      key={entry.id}
      entry={entry}
      top={entry.id === top}
      cover={entry.id === cover}
      riding={entry.id === riding}
      {...p}
      host={host}
    >
      {over}
    </CardDrawer>
  );
  const up = stack.filter((entry) => entry.state !== "kept");
  return (
    <>
      {stack.filter((entry) => entry.state === "kept").map((entry) => drawer(entry))}
      {up.reduceRight<ReactNode>((over, entry) => drawer(entry, over), null)}
    </>
  );
}

function CardDrawer({
  entry,
  top,
  cover,
  riding,
  host,
  children,
  ...p
}: StackProps & { entry: CardEntry; top: boolean; cover: boolean; riding: boolean; host: HTMLElement; children?: ReactNode }) {
  const { id, frame } = entry;
  const slot = useCallback((node: HTMLElement | null) => setCard(id, { slot: node }), [id]);
  const { onPhone, fromBottom } = p;
  // The sheet's own snap points, the same constant values (sheet/insets).
  const snaps = snapsOf(fromBottom);
  // Its own snap point, kept in its entry: set as it opens, from then on
  // the pilot's or the card's (useCardSize).
  const at = entry.at ?? cardOpening(entry);
  const unset = entry.at === undefined && entry.state === "open";
  useLayoutEffect(() => {
    if (unset) setCard(id, { at });
  }, [unset, id, at]);
  const ask = useCallback((size: PanelState) => setCard(id, { at: size }), [id]);
  // Gone, it is no longer up: opened again it comes up anew (sheetTopSlot).
  useEffect(() => () => cardSettled(id, false), [id]);
  // A drag let go: the size of the snap point the Drawer picked, one of ours.
  const snapped = (point: Drawer.Root.SnapPoint | null) => {
    if (point === null || !top) return;
    const target = sizeAt(fromBottom, point);
    if (target && target !== at) ask(target);
  };
  const topSlot = onPhone && fromBottom && riding;
  return (
    <Drawer.Root
      // Mounted closed, opened once its size is set (the layout effect
      // above, before the first paint): so it rises from the foot (SLIDE).
      open={entry.state === "open" && entry.at !== undefined}
      modal={false}
      swipeDirection={fromBottom ? "down" : "up"}
      snapPoints={onPhone ? snaps.points : undefined}
      snapToSequentialPoints
      snapPoint={onPhone ? snaps.at[at] : undefined}
      onSnapPointChange={snapped}
      // The map's buttons move onto it once it has finished coming up (sheetTopSlot).
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
        // with its title row (the card rule's 10).
        if (details.reason === "swipe") {
          details.cancel();
          ask("peek");
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
              // The side panel's card does not swipe: no sizes to swipe between.
              data-base-ui-swipe-ignore={onPhone ? undefined : ""}
              // Its corners the sheet's: drawn outside the sheet's clip, so it can stand over it.
              style={onPhone ? { borderRadius: `${PILL_RADIUS}px ${PILL_RADIUS}px 0 0` } : undefined}
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
                onPhone && (entry.state === "leaving" ? "transition-none" : SLIDE),
                onPhone && fromBottom && UNDER_INDICATOR,
              )}
            >
              {/* The map's buttons ride the top card's top, as the sheet's (OnSheetTop), once it is up. */}
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
      {/* The cards over it, nested in it (CardStack). */}
      {children}
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
