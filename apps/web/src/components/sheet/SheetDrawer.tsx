import { useEffect, type CSSProperties, type ComponentProps, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { PILL_RADIUS, usePanelDragging } from "../../lib/mapChrome";
import { sheetTopRef } from "./sheetTopSlot";
import { SheetViewport } from "./SheetViewport";
import { TAB_BAR_ROOM } from "./insets";

/** The Drawer's keyboard inset, 0 or a keyboard's height. */
const KEYBOARD = "var(--drawer-keyboard-inset, 0px)";
const VIEWPORT_BOTTOM = `max(${KEYBOARD}, env(safe-area-inset-bottom))`;
/** Over the tab bar: the sheet's sizes all stand on it (the owner,
 *  2026-11-13: tab bar, option A), and a keyboard, taller, covers it. */
const OVER_TAB_BAR = `max(${KEYBOARD}, ${TAB_BAR_ROOM})`;
/** A bottom sheet's ground carried on under its viewport to the screen's
 *  foot -- the home indicator's inset, or the tab bar's room, which the
 *  viewport sets as --sheet-under -- so the bar floats on the sheet as
 *  iOS 26's does: all the way up the popup ends at the viewport's foot
 *  (lower, it hangs past it by its snap offset). Its own colour, so it
 *  goes clear with it under a card, whose drawer has its own (CardStack). */
export const UNDER_INDICATOR =
  "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-(--sheet-under,env(safe-area-inset-bottom)) after:bg-inherit";

/**
 * What the sheet holds under a card, as Base UI's nested drawers demo has
 * its content: faded out while a nested drawer is open
 * (data-nested-drawer-open), on the demo's 300 ms and curve -- and kept
 * out while a finger drags the card, where the demo brings it back (the
 * owner, 2026-11-11: "When drag kosh down, that's when I see the second
 * sheet"): the card is the one sheet in sight, as Apple Maps'. Hidden
 * too once faded, so it is out of a finger's, the keyboard's and a screen
 * reader's way: visibility holds visible to a transition's end and turns
 * visible at its start, so it never cuts the fade.
 */
const GIVE_WAY =
  "transition-[opacity,visibility] duration-300 ease-[cubic-bezier(0.45,1.005,0,1.005)] motion-reduce:transition-none group-data-nested-drawer-open/sheet:invisible group-data-nested-drawer-open/sheet:opacity-0";

/**
 * The phone's sheet itself, Base UI's stock Drawer (MapPanel's, the owner
 * 2026-11-10): open and non-modal, so the map stays the map's; its snap
 * points the pill, half and all the way up, a throw going where the Drawer
 * takes it (its own behaviour, unchanged: the owner, 2026-11-11, "Just let
 * the drawer do what it does"); on the keyboard while it
 * is up (`VirtualKeyboardProvider`'s --drawer-keyboard-inset, which also
 * scrolls the field typed into into sight: Safari leaves a fixed sheet
 * under the keyboard). Never closed: Escape with no card over it lowers it
 * to the pill (MapPanel's `lower`), a swipe past the pill lands on it.
 * What it shows follows its snap point the moment that is set, so what
 * rides it comes with the slide.
 */
export function SheetDrawer({
  fromBottom,
  snapPoints,
  snapPoint,
  snapped,
  popupRef,
  lower,
  ready,
  popup,
  look,
  grabber,
  topSlot,
  cards,
  tabBar,
  children,
}: {
  fromBottom: boolean;
  /** Fixed values in the Drawer's own units (sheet/insets' snapsOf). */
  snapPoints: Drawer.Root.SnapPoint[];
  snapPoint: Drawer.Root.SnapPoint;
  snapped: (point: Drawer.Root.SnapPoint | null, details: Drawer.Root.SnapPointChangeEventDetails) => void;
  /** The popup's element, for what it covers of the map (useSheetCover). */
  popupRef: (node: HTMLElement | null) => void;
  /** Escape: lowered to the pill with no card over it; whether it took the key. */
  lower: () => boolean;
  /** Eased only once drawn where it rests (useDrawn). */
  ready: boolean;
  /** The popup's marks (data-slot="map-panel", its size, its label). */
  popup: Record<string, string | boolean | undefined>;
  look: string;
  /** The sheet's grabber, at its free edge: outside the clip of its
   *  corners, so its hit area reaches past the sheet's edge (SheetGrabber). */
  grabber?: ReactNode;
  /** The map's buttons ride its top (OnSheetTop): not once a card has come up over it, whose top they ride. */
  topSlot: boolean;
  /** The cards over it (CardStack), outside the clip of its corners, so a card can stand higher than it. */
  cards: ReactNode;
  /** The tab bar under the sheet (SheetTabBar), its sizes over it. */
  tabBar?: ReactNode;
  children: ReactNode;
}) {
  const bottom = tabBar ? OVER_TAB_BAR : fromBottom ? VIEWPORT_BOTTOM : KEYBOARD;
  return (
    <Drawer.Root
      open
      modal={false}
      disablePointerDismissal
      swipeDirection={fromBottom ? "down" : "up"}
      snapPoints={snapPoints}
      // One size per swipe however fast, the Drawer's own option for it (the owner, 2026-11-11).
      snapToSequentialPoints
      snapPoint={snapPoint}
      onSnapPointChange={snapped}
      // Never closed. Its Escape, with no card over it (the card's own
      // drawer takes that), lowers it; taken, so a device's Back
      // (lib/backNavigation) goes no further.
      onOpenChange={(open, details) => {
        if (open) return;
        details.cancel();
        if (details.reason === "escape-key" && !details.event.defaultPrevented && lower()) details.event.preventDefault();
      }}
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          {/* The screen the sheet is held on, which the Drawer measures its
              snap points in: on the keyboard while it is up, and a bottom
              sheet's over the home indicator, so its pill's row is clear of
              it (the indicator's room was px added to every snap point). Not
              a target itself, so the map under it is the map's. */}
          <SheetViewport
            className="pointer-events-none fixed inset-x-0 top-0 z-40 print:static"
            style={{ bottom, ...(tabBar ? { "--sheet-under": TAB_BAR_ROOM } : {}) } as CSSProperties}
          >
            <Drawer.Popup
              {...popup}
              ref={popupRef}
              data-sheet=""
              // The Drawer's own word on a finger's drag, its or a card's on it.
              render={(own, state) => <Told swiping={state.swiping || state.nestedDrawerSwiping} {...own} />}
              initialFocus={false}
              finalFocus={false}
              style={{
                // All the way up clear of the status bar (a bottom sheet's) or
                // the home indicator (a top sheet's), and eight: the Drawer's
                // full snap point (1) is no taller than the popup.
                height: `calc(100% - env(safe-area-inset-${fromBottom ? "top" : "bottom"}) - 8px)`,
                borderRadius: fromBottom ? `${PILL_RADIUS}px ${PILL_RADIUS}px 0 0` : `0 0 ${PILL_RADIUS}px ${PILL_RADIUS}px`,
              }}
              className={cn(
                "group/sheet pointer-events-auto absolute inset-x-0 flex flex-col text-foreground outline-none will-change-transform print:static",
                // Slid by the Drawer's snap offset and the finger's movement,
                // in a class: the Drawer clears its popup's inline transform
                // as a swipe starts. Eased on the Drawer's own curve, never
                // under a finger, and not before its first measure (it would
                // slide in from its full height as the page opens).
                "[transform:translateY(calc(var(--drawer-snap-point-offset)_+_var(--drawer-swipe-movement-y)))]",
                // Copied for what is inside it (SheetParts, CardStack): Base UI's own do not inherit.
                "[--sheet-offset:var(--drawer-snap-point-offset)] [--sheet-swipe:var(--drawer-swipe-movement-y)] [--sheet-base:var(--drawer-snap-point-offset)]",
                // Its ground, edge and shadow fade on the same time as a card comes and goes.
                ready &&
                  "transition-[transform,background-color,box-shadow,backdrop-filter] duration-(--motion-drawer) ease-(--motion-drawer-ease)",
                "data-swiping:transition-none motion-reduce:transition-none",
                fromBottom ? cn("bottom-0", UNDER_INDICATOR) : "top-0",
                look,
                // A card up (Base UI's own data-nested-drawer-open): the card
                // is the one sheet in sight, as Apple Maps' place card stands
                // in for its search, so this one's ground, edge and shadow
                // fade away; the card, drawn inside it, stays (the owner's
                // iPhone, 2026-11-11: an empty grey sheet over a card at its
                // pill), and while a finger drags the card too. Nor does its
                // box take a tap: all the way up under a card at its pill it
                // was a pane over the whole map, unseen, that a tap on a
                // stop's pin found in place of the pin (stops-sheet.spec,
                // 2026-11-13); the card sets its own pointer-events back.
                "data-nested-drawer-open:bg-transparent data-nested-drawer-open:shadow-none data-nested-drawer-open:ring-0 data-nested-drawer-open:backdrop-blur-none data-nested-drawer-open:pointer-events-none",
              )}
            >
              {/* Over its top edge, the parts that ride it (OnSheetTop):
                  inside the popup, so they move with it under a finger and on
                  its curve; a finger on them is theirs, not the sheet's. */}
              {fromBottom && topSlot && (
                <div
                  ref={sheetTopRef}
                  data-sheet-top=""
                  data-base-ui-swipe-ignore=""
                  className="pointer-events-none absolute inset-x-0 bottom-full"
                />
              )}
              {/* Its grabber and body fade out under a card, the card's own in
                  their place. The grabber's in a box of no height, not
                  display: contents, which has no opacity to fade. */}
              <div className={GIVE_WAY}>{grabber}</div>
              {/* Clipped to its corners here, not on the popup, which the
                  parts over its top stand outside of. */}
              <div className={cn("relative flex min-h-0 flex-1 flex-col overflow-clip rounded-[inherit]", GIVE_WAY)}>{children}</div>
              {cards}
            </Drawer.Popup>
            {/* The tab bar, in the room under the viewport: over the sheet's
                ground there, under a keyboard that is up. */}
            {tabBar && <div className="absolute inset-x-0 top-full z-10 px-4">{tabBar}</div>}
          </SheetViewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}

/** The popup's element, telling the page while a finger drags the sheet
 *  (usePanelDragging): what is drawn under the pill is drawn as it comes. */
function Told({ swiping, ...own }: ComponentProps<"div"> & { swiping: boolean }) {
  useEffect(() => usePanelDragging.setState({ dragging: swiping }), [swiping]);
  return <div {...own} />;
}
