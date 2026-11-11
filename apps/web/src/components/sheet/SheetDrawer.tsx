import { useEffect, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { PILL_RADIUS, usePanelDragging } from "../../lib/mapChrome";
import { sheetTopRef } from "./sheetTopSlot";
import { SheetViewport } from "./SheetViewport";

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
  lower,
  ready,
  popup,
  style,
  look,
  grabber,
  topSlot,
  cards,
  children,
}: {
  fromBottom: boolean;
  snapPoints: number[];
  snapPoint: number;
  snapped: (point: Drawer.Root.SnapPoint | null, details: Drawer.Root.SnapPointChangeEventDetails) => void;
  /** Escape: lowered to the pill with no card over it; whether it took the key. */
  lower: () => boolean;
  /** Eased only once drawn where it rests (useDrawn). */
  ready: boolean;
  /** The popup's marks (data-slot="map-panel", its size, its label). */
  popup: Record<string, string | boolean | undefined>;
  style: CSSProperties;
  look: string;
  /** The sheet's grabber, at its free edge: outside the clip of its
   *  corners, so its hit area reaches past the sheet's edge (SheetGrabber). */
  grabber?: ReactNode;
  /** The map's buttons ride its top (OnSheetTop): not while a card is over it, whose top they ride. */
  topSlot: boolean;
  /** The cards over it (CardStack), outside the clip of its corners, so a card can stand higher than it. */
  cards: ReactNode;
  children: ReactNode;
}) {
  return (
    <Drawer.Root
      open
      modal={false}
      disablePointerDismissal
      swipeDirection={fromBottom ? "down" : "up"}
      snapPoints={snapPoints}
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
          {/* The screen the sheet is held on: on the keyboard while it is up.
              Not a target itself, so the map under it is the map's. */}
          <SheetViewport
            className="pointer-events-none fixed inset-x-0 top-0 z-40 print:static"
            style={{ bottom: "var(--drawer-keyboard-inset, 0px)" }}
          >
            <Drawer.Popup
              {...popup}
              data-sheet=""
              // The Drawer's own word on a finger's drag, its or a card's on it.
              render={(own, state) => <Told swiping={state.swiping || state.nestedDrawerSwiping} {...own} />}
              initialFocus={false}
              finalFocus={false}
              style={{
                ...style,
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
                ready && "transition-transform duration-450 ease-[cubic-bezier(0.32,0.72,0,1)]",
                "data-swiping:transition-none motion-reduce:transition-none",
                fromBottom ? "bottom-0" : "top-0",
                look,
                // A card up (Base UI's own data-nested-drawer-open): the card
                // is the one sheet in sight, as Apple Maps' place card stands
                // in for its search, so this one's ground, edge and shadow
                // give way; the card, drawn inside it, stays (the owner's
                // iPhone, 2026-11-11: an empty grey sheet over a card at its
                // pill).
                "data-nested-drawer-open:bg-transparent data-nested-drawer-open:shadow-none data-nested-drawer-open:ring-0 data-nested-drawer-open:backdrop-blur-none",
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
              {/* Its grabber and body out of sight under a card, the card's own in their place. */}
              <div className="contents group-data-nested-drawer-open/sheet:invisible">{grabber}</div>
              {/* Clipped to its corners here, not on the popup, which the
                  parts over its top stand outside of. */}
              <div className="relative flex min-h-0 flex-1 flex-col overflow-clip rounded-[inherit] group-data-nested-drawer-open/sheet:invisible">
                {children}
              </div>
              {cards}
            </Drawer.Popup>
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
