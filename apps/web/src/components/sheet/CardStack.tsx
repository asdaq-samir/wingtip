import { useCallback, type CSSProperties, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { backOne } from "../../hooks/use-shortcuts";
import type { PanelState } from "../../lib/mapChrome";
import { setCard, useSheetCards, type CardEntry } from "../../lib/sheetCards";
import type { Detents } from "./insets";
import { SheetViewport } from "./SheetViewport";

export interface StackProps {
  /** A phone's sheet: the cards are drawers with its sizes and its swipe.
   *  Else the side panel's: each covers the panel, nothing to swipe. */
  onPhone: boolean;
  fromBottom: boolean;
  detents: Detents;
  size: PanelState;
  snap: PanelState;
  /** At the pill and not moving: a card's title row alone in sight. */
  resting: boolean;
  /** Eased only once the sheet has been drawn where it rests (useSheetLife). */
  ready: boolean;
  /** The sheet's own reading of a card's drag let go (MapPanel). */
  snapped: (point: Drawer.Root.SnapPoint | null, details: Drawer.Root.SnapPointChangeEventDetails) => void;
  ask: (size: PanelState) => void;
  /** The top card's grabber (the sheet's SheetGrabber, its own sizes), at
   *  its free edge: a bottom sheet's top, else its foot. */
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
 * card's, Escape is the card's first, and the sheet under it is left as
 * it was -- its search, its list and its place in it kept, nothing
 * measured, nothing rebuilt.
 *
 * Put on the page inside the sheet's popup (`host`), its corners and its
 * place: so a card is in the sheet for everything that looks for the sheet
 * (a device's Back, the browser tests, index.css's rules). Each card has
 * the sheet's three sizes, the same as the sheet's own while a card is up,
 * and one size for both (useSheetLife): the sheet moves by its snap
 * offset, the card on it by its own finger's drag alone, so a card let go
 * eases with the sheet to the size picked, both on the Drawer's curve.
 * A throw goes where the Drawer takes it, its own behaviour (the owner,
 * 2026-11-11). The keyboard's inset is the Drawer's own
 * (VirtualKeyboardProvider, --drawer-keyboard-inset): a field typed into
 * in a card is kept in sight over it.
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
  const { onPhone, fromBottom, detents } = p;
  return (
    <Drawer.Root
      open={entry.shown}
      modal={false}
      swipeDirection={fromBottom ? "down" : "up"}
      snapPoints={onPhone ? [detents.peek, detents.half, detents.full] : undefined}
      snapPoint={onPhone ? detents[p.snap] : undefined}
      onSnapPointChange={p.snapped}
      onOpenChange={(open, details) => {
        if (open) return;
        // The card on top alone hears it: two cards open are two drawers
        // nested in the sheet side by side, and both heard one Escape.
        // The focus going elsewhere -- the sheet, the map -- leaves it
        // open: it is no modal.
        if (!top || details.reason === "focus-out") return details.cancel();
        // A swipe past the pill is no close: the sheet stays at the pill
        // with the card's title row (the card rule's 10).
        if (details.reason === "swipe") {
          details.cancel();
          p.ask("peek");
          return;
        }
        if (frame.dismiss) return frame.dismiss(details);
        details.cancel();
        // Escape a level back, as the sheet's own Escape does with a card
        // open (MapPanel): the top card's close, unless a layer in it took
        // the key first (Setup's page).
        if (details.reason !== "escape-key") return;
        details.allowPropagation();
        const event = details.event;
        setTimeout(() => {
          if (!event.defaultPrevented) backOne(host.ownerDocument);
        });
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
              // The side panel's card does not swipe: no sizes to swipe between.
              data-base-ui-swipe-ignore={onPhone ? undefined : ""}
              className={cn(
                "group/sheet pointer-events-auto absolute inset-0 flex flex-col overflow-clip text-foreground outline-none print:static",
                p.look,
                // Moved by its own drag alone, its Drawer's movement; the sheet
                // under it carries it by the snap offset. Copied for what is
                // inside (SheetParts' FOLLOW): Base UI's own do not inherit.
                onPhone && "[transform:translateY(var(--drawer-swipe-movement-y))] [--sheet-swipe:var(--drawer-swipe-movement-y)]",
                onPhone && p.ready && EASE,
                // A top sheet's card clear of the status bar.
                onPhone && !fromBottom && "pt-[env(safe-area-inset-top)]",
              )}
            >
              {onPhone && fromBottom && top && p.grabber}
              <CardScroller {...p} slot={slot} />
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
 * and a tap on the row brings the sheet back to half.
 */
function CardScroller({ slot, resting, onPhone, ask, below, follow }: StackProps & { slot: (node: HTMLElement | null) => void }) {
  const pill = onPhone && resting;
  return (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions -- a pointer convenience, not a control: the grabber is the keyboard's way to raise the sheet, and the card's own buttons stay focusable
    <div
      onClick={
        pill
          ? (event) => {
              if (!(event.target instanceof Element) || !event.target.closest("button, a, input, [role=button]")) ask("half");
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
          "flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] print:overflow-visible",
          below,
          pill && "invisible [&_[data-sheet-head]]:visible",
        )}
      />
    </div>
  );
}
