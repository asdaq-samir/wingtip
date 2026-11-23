import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { PILL_RADIUS, usePanelDragging } from "../../lib/mapChrome";
import { SETTLE_MS, SHEET_SLIDE } from "./insets";
import { sheetTopRef } from "./sheetTopSlot";
import { useSwipeRelay } from "./sheetFollow";
import { SheetViewport } from "./SheetViewport";

/** The Drawer's keyboard inset, 0 or a keyboard's height. */
const KEYBOARD = "var(--drawer-keyboard-inset, 0px)";
const VIEWPORT_BOTTOM = `max(${KEYBOARD}, env(safe-area-inset-bottom))`;
/** A bottom sheet's ground carried on under the home indicator, below its
 *  viewport: all the way up the popup ends at the viewport's foot (lower,
 *  it hangs past it by its snap offset). Its own colour, so it goes clear
 *  with it under a card, whose drawer has its own (CardStack). */
export const UNDER_INDICATOR =
  "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-[env(safe-area-inset-bottom)] after:bg-inherit";

/**
 * What the sheet holds under a card, as Base UI's nested drawers demo has
 * its content: faded out while a nested drawer is open
 * (data-nested-drawer-open), on the demo's 300 ms and curve -- and kept
 * out while a finger drags the card, where the demo brings it back (the
 * owner, 2026-11-11: "When drag kosh down, that's when I see the second
 * sheet"): the card is the one sheet in sight, as Apple Maps'. Hidden
 * too once faded, so it is out of a finger's, the keyboard's and a screen
 * reader's way: visibility holds visible to a transition's end and turns
 * visible at its start, so it never cuts the fade. On the card's own time
 * and curve, not the demo's 300 ms: the two ran on two clocks, and as a
 * card went away the search was back whole while the card was still a
 * third in sight (the apple-design and gestures audits of 2026-11-23, N5
 * and N6).
 */
const GIVE_WAY =
  "transition-[opacity,visibility] duration-(--motion-drawer) ease-(--motion-drawer-ease) motion-reduce:transition-none group-data-nested-drawer-open/sheet:invisible group-data-nested-drawer-open/sheet:opacity-0";

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
  /** The map's buttons ride its top (OnSheetTop): not while a card is open over it, whose top they ride. */
  topSlot: boolean;
  /** The cards over it (CardStack), outside the clip of its corners, so a card can stand higher than it. */
  cards: ReactNode;
  children: ReactNode;
}) {
  // The popup watched for its movement's few readers (sheet/sheetFollow).
  const relayed = useSwipeRelay(popupRef);
  const { shown, letGo } = useSnapFirst(snapPoint, snapped);
  return (
    <Drawer.Root
      open
      modal={false}
      disablePointerDismissal
      swipeDirection={fromBottom ? "down" : "up"}
      snapPoints={snapPoints}
      // One size per swipe however fast, the Drawer's own option for it (the owner, 2026-11-11).
      snapToSequentialPoints
      snapPoint={shown}
      onSnapPointChange={letGo}
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
            style={{ bottom: fromBottom ? VIEWPORT_BOTTOM : KEYBOARD }}
          >
            <Drawer.Popup
              {...popup}
              ref={relayed}
              // The Drawer's own word on a finger's drag, its or a card's on it.
              render={(own, state) => <Told swiping={state.swiping || state.nestedDrawerSwiping} {...own} />}
              initialFocus={false}
              finalFocus={false}
              // Eased once drawn where it rests (useDrawn), for what eases with it (SheetScroller's cut).
              data-ready={ready || undefined}
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
                // Its snap offset copied for what is inside it (SheetParts,
                // CardStack): Base UI's own does not inherit. It changes once
                // a let-go; the finger's movement, which changes at every
                // move, is handed only to the parts that read it
                // (sheet/sheetFollow), not inherited by the whole sheet.
                "[--sheet-offset:var(--drawer-snap-point-offset)] [--sheet-base:var(--drawer-snap-point-offset)]",
                // Its transform alone eased: its ground, edge and shadow go
                // at once under a card, which covers them as it comes and
                // goes, where easing them repainted the largest box on the
                // screen for 450 ms as a card mounted (the animation audit of
                // 2026-11-23, M7). Kept under Reduce Motion (SHEET_SLIDE).
                ready && "transition-transform duration-(--motion-drawer) ease-(--motion-drawer-ease)",
                SHEET_SLIDE,
                "data-swiping:transition-none",
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
          </SheetViewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}

/** The popup's element, telling the page while a finger drags the sheet
 *  (usePanelDragging): what is drawn under the pill is drawn as it comes.
 *  Held from the finger's first move until the sheet has settled, the
 *  Drawer's own time after the lift (insets' SETTLE_MS), and marked on the
 *  popup (data-risen) for sheet/insets' faces: Base UI's data-swiping goes
 *  the moment the finger lifts, a frame before the sheet's new size is
 *  told, and what had risen with it dipped out and back (the owner,
 *  2026-11-16: "still not as seamless as the airport/search card"). */
function Told({ swiping, ...own }: ComponentProps<"div"> & { swiping: boolean }) {
  useEffect(() => {
    if (swiping) {
      usePanelDragging.setState({ dragging: true });
      return;
    }
    const settle = setTimeout(() => usePanelDragging.setState({ dragging: false }), SETTLE_MS);
    return () => clearTimeout(settle);
  }, [swiping]);
  // And over once the finger has lifted and the sheet settled, whatever the
  // Drawer's state says: a press that never became a swipe left it
  // "swiping", the pill drawn as risen with nothing moving (a touch drag in
  // Chromium, 2026-11-16).
  useEffect(() => {
    if (!swiping) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const over = () => {
      clearTimeout(settle);
      settle = setTimeout(() => usePanelDragging.setState({ dragging: false }), SETTLE_MS);
    };
    const ends = ["pointerup", "pointercancel", "touchend", "touchcancel"] as const;
    for (const e of ends) window.addEventListener(e, over, true);
    return () => {
      for (const e of ends) window.removeEventListener(e, over, true);
      clearTimeout(settle);
    };
  }, [swiping]);
  const risen = usePanelDragging((d) => d.dragging);
  return <div {...own} data-risen={risen ? "" : undefined} />;
}

type Snapped = (point: Drawer.Root.SnapPoint | null, details: Drawer.Root.SnapPointChangeEventDetails) => void;

/**
 * A drag let go, the sheet's slide begun before the page hears of it: the
 * snap point the finger picked held here at once, a render of the Drawer
 * alone, and the page told (`snapped`, MapPanel's letGo, whose new size
 * re-renders the whole workspace) once the slide's first frame is drawn
 * (a frame, then a task). Told within the let-go, that render held the
 * sheet still where the finger left it for 164 ms and it then set off with
 * a 17.5 px step (the animation audit of 2026-11-23, M1). The pick is held
 * only while the page's own snap point is the one it had when picked, so
 * the page's answer rules as soon as it comes; let go past the pill (no
 * snap point) the page is told at once, as it refuses the close there.
 */
function useSnapFirst(snapPoint: Drawer.Root.SnapPoint, snapped: Snapped) {
  const [chosen, choose] = useState<{ point: Drawer.Root.SnapPoint; from: Drawer.Root.SnapPoint } | null>(null);
  const later = useRef({ frame: 0, task: 0 });
  useEffect(() => {
    const pending = later.current;
    return () => {
      cancelAnimationFrame(pending.frame);
      clearTimeout(pending.task);
    };
  }, []);
  const letGo: Snapped = (point, details) => {
    if (point === null) return snapped(point, details);
    cancelAnimationFrame(later.current.frame);
    clearTimeout(later.current.task);
    choose({ point, from: snapPoint });
    later.current.frame = requestAnimationFrame(() => {
      later.current.task = window.setTimeout(() => {
        snapped(point, details);
        // Let go once the page has answered, in a task of its own.
        later.current.task = window.setTimeout(() => choose(null), 0);
      }, 0);
    });
  };
  const shown = chosen && chosen.from === snapPoint ? chosen.point : snapPoint;
  return { shown, letGo };
}
