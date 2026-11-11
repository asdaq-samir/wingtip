import { useCallback, type CSSProperties, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { PILL_RADIUS, type PanelState } from "../../lib/mapChrome";
import { closeTopCard } from "../../lib/openCards";
import { setCard, useSheetCards, type CardEntry } from "../../lib/sheetCards";
import type { Detents } from "./insets";
import { sheetTopRef } from "./sheetTopSlot";
import { SheetViewport } from "./SheetViewport";

export interface StackProps {
  /** A phone's sheet: the cards are drawers with its sizes and its swipe.
   *  Else the side panel's: each covers the panel, nothing to swipe. */
  onPhone: boolean;
  fromBottom: boolean;
  detents: Detents;
  /** The top card's size, the page's (MapPanel's frontmost sheet), and the way to ask for another. */
  front: PanelState;
  ask: (size: PanelState) => void;
  /** Eased only once the sheet has been drawn where it rests (useDrawn). */
  ready: boolean;
  /** The top card's grabber (SheetGrabber, the plain one), for the page's size. */
  grabber: ReactNode;
  /** The card look: the sheet's own. */
  look: string;
  /** Under the body's glass, the shade the sheet's body has (SheetParts). */
  below: string;
  /** A top sheet's: what stays in sight at its free edge (SheetParts). */
  follow?: string;
}

/** A card's drag eased on the Drawer's own curve, never under a finger. */
const EASE =
  "transition-transform duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:transition-none motion-reduce:transition-none";

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
 * owner, 2026-11-11: "Just let the drawer do what it does"): the top
 * card's is the page's size (MapPanel's frontmost sheet), each under it
 * kept at its own (`at`) for when it is on top again. Put on the page inside the
 * sheet's popup (`host`), so a card is in the sheet for what looks for it
 * there (the browser tests, index.css), and placed from the sheet's snap
 * offset to its own. The keyboard's inset is the Drawer's own
 * (VirtualKeyboardProvider).
 */
export function CardStack(p: StackProps & { host: HTMLElement | null }) {
  const stack = useSheetCards((s) => s.stack);
  if (!p.host) return null;
  const top = [...stack].reverse().find((entry) => entry.shown)?.id;
  return stack.map((entry) => <CardDrawer key={entry.id} entry={entry} top={entry.id === top} {...p} host={p.host!} />);
}

function CardDrawer({ entry, top, host, ...p }: StackProps & { entry: CardEntry; top: boolean; host: HTMLElement }) {
  const { id, frame } = entry;
  const slot = useCallback((node: HTMLElement | null) => setCard(id, { slot: node }), [id]);
  const { onPhone, fromBottom, detents, ask } = p;
  // The top card at the page's size; one under it at its own, kept.
  const at = top ? p.front : (entry.at ?? "half");
  // A drag let go: the size nearest the snap point the Drawer picked.
  const snapped = (point: Drawer.Root.SnapPoint | null) => {
    if (point === null || !top) return;
    const px = typeof point === "number" ? point : parseFloat(point);
    const target = (Object.keys(detents) as PanelState[]).reduce((best, s) =>
      Math.abs(detents[s] - px) < Math.abs(detents[best] - px) ? s : best,
    );
    if (target !== at) ask(target);
  };
  const topSlot = onPhone && fromBottom && top;
  return (
    <Drawer.Root
      open={entry.shown}
      modal={false}
      swipeDirection={fromBottom ? "down" : "up"}
      snapPoints={onPhone ? [detents.peek, detents.half, detents.full] : undefined}
      snapPoint={onPhone ? detents[at] : undefined}
      onSnapPointChange={snapped}
      onOpenChange={(open, details) => {
        if (open) return;
        // The card on top alone hears it: two cards open are two drawers
        // nested in the sheet side by side, and both heard one Escape.
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
              // The side panel's card does not swipe: no sizes to swipe between.
              data-base-ui-swipe-ignore={onPhone ? undefined : ""}
              // Its corners the sheet's: drawn outside the sheet's clip, so it can stand over it.
              style={
                onPhone
                  ? { borderRadius: fromBottom ? `${PILL_RADIUS}px ${PILL_RADIUS}px 0 0` : `0 0 ${PILL_RADIUS}px ${PILL_RADIUS}px` }
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
                // A top sheet's card clear of the status bar.
                onPhone && !fromBottom && "pt-[env(safe-area-inset-top)]",
              )}
            >
              {/* The map's buttons ride the top card's top, as the sheet's (OnSheetTop). */}
              {topSlot && (
                <div
                  ref={sheetTopRef}
                  data-sheet-top=""
                  data-base-ui-swipe-ignore=""
                  className="pointer-events-none absolute inset-x-0 bottom-full"
                />
              )}
              {onPhone && fromBottom && top && p.grabber}
              <div className="flex min-h-0 flex-1 flex-col overflow-clip rounded-[inherit]">
                <CardScroller {...p} pill={onPhone && at === "peek"} raise={() => ask("half")} slot={slot} />
              </div>
              {!(onPhone && fromBottom) && top && p.grabber}
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
  follow,
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
      className={cn("flex min-h-0 flex-1 flex-col", follow)}
      style={{ "--sheet-head": "0px" } as CSSProperties}
    >
      <Drawer.Content
        ref={slot}
        data-sheet-scroll=""
        data-panel-body=""
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto print:overflow-visible",
          below,
          pill && "invisible [&_[data-sheet-head]]:visible",
        )}
      />
    </div>
  );
}
