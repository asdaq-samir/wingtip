import type { CSSProperties, ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { PILL_RADIUS } from "../../lib/mapChrome";
import { sheetTopRef } from "./sheetTopSlot";
import { SheetViewport } from "./SheetViewport";

/**
 * The phone's sheet itself, Base UI's stock Drawer (MapPanel's, the owner
 * 2026-11-10): open and non-modal, so the map stays the map's; its snap
 * points the pill, half and all the way up; one size per throw, however
 * hard (`snapToSequentialPoints`, decision 0018); on the keyboard while it
 * is up (`VirtualKeyboardProvider`'s --drawer-keyboard-inset, which also
 * scrolls the field typed into into sight: Safari leaves a fixed sheet
 * under the keyboard). Never closed: Escape lowers it to the pill
 * (MapPanel's `lower`), a swipe past the pill lands on it.
 */
export function SheetDrawer({
  fromBottom,
  snapPoints,
  snapPoint,
  snapped,
  lower,
  ready,
  onLanded,
  setPanel,
  popup,
  style,
  look,
  children,
}: {
  fromBottom: boolean;
  snapPoints: number[];
  snapPoint: number;
  snapped: (point: Drawer.Root.SnapPoint | null, details: Drawer.Root.SnapPointChangeEventDetails) => void;
  lower: (event: Event) => void;
  /** Eased only once drawn where it rests (useSheetLife). */
  ready: boolean;
  onLanded: () => void;
  setPanel: (node: HTMLElement | null) => void;
  /** The popup's marks (data-slot="map-panel", its size, its label). */
  popup: Record<string, string | boolean | undefined>;
  style: CSSProperties;
  look: string;
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
      snapToSequentialPoints
      onSnapPointChange={snapped}
      // Its Escape let on to the document, where the Drawer would stop it:
      // Setup's page goes back a level from there (ConsoleLayer) wherever
      // the focus is in the sheet.
      onOpenChange={(open, details) => {
        if (open) return;
        details.cancel();
        if (details.reason !== "escape-key") return;
        details.allowPropagation();
        lower(details.event);
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
              ref={setPanel}
              {...popup}
              data-sheet=""
              // Landed: the Drawer's own slide to its snap point has ended.
              onTransitionEnd={(event) => {
                if (event.target === event.currentTarget && event.propertyName === "transform") onLanded();
              }}
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
                "[--sheet-offset:var(--drawer-snap-point-offset)] [--sheet-swipe:var(--drawer-swipe-movement-y)]",
                ready && "transition-transform duration-450 ease-[cubic-bezier(0.32,0.72,0,1)]",
                "data-swiping:transition-none motion-reduce:transition-none",
                fromBottom ? "bottom-0" : "top-0",
                look,
              )}
            >
              {/* Over its top edge, the parts that ride it (OnSheetTop):
                  inside the popup, so they move with it under a finger and on
                  its curve; a finger on them is theirs, not the sheet's. */}
              {fromBottom && (
                <div
                  ref={sheetTopRef}
                  data-sheet-top=""
                  data-base-ui-swipe-ignore=""
                  className="pointer-events-none absolute inset-x-0 bottom-full"
                />
              )}
              {/* Clipped to its corners here, not on the popup, which the
                  parts over its top stand outside of; the cards over it
                  positioned in it. */}
              <div className="relative flex min-h-0 flex-1 flex-col overflow-clip rounded-[inherit]">{children}</div>
            </Drawer.Popup>
          </SheetViewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}
