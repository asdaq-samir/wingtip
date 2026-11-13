import { createContext } from "react";
import { create } from "zustand";
import { TEXT } from "./text";
import { MOTION } from "./tokens";

/**
 * What the map's chrome shares -- the panel over it (MapPanel), its
 * buttons (MapControls) and the map itself (GlMapShell) -- kept apart
 * from the components so each file exports components only.
 */

/**
 * How far the panel is out, as iOS's sheet detents are named in Maps:
 * resting at the screen's edge with only its top showing, half the
 * screen (an airport's card), or the whole of it (the nav log and the
 * briefing).
 */
export type PanelState = "peek" | "half" | "full";

/** What the panel covers of the map where it has settled -- the capsule
 *  at rest, the half sheet out -- in pixels from each edge, so the map
 *  can fit a route clear of it and keep its chart credit in sight
 *  (GlMapShell, index.css). */
export interface MapInsets {
  top: number;
  bottom: number;
  left: number;
  /** Where the panel has settled: at rest (its capsule, or a desktop's
   *  corner) or out. The map follows a change of this (GlMapShell), not
   *  every change of the size -- a notice under the route, the head
   *  measured again -- which would take the map from under a pilot's
   *  finger as the plan streams in. */
  out: boolean;
  /** All the way up: the map hidden, fitted to what shows once it comes
   *  down. Coming down to the pill is a change the map follows too, the
   *  pill's own height measured as it comes. */
  up: boolean;
  /** A card in front (CardStack): its coming and going leaves the chart
   *  where it is (GlMapShell, cardRoom), where the sheet's own size moves
   *  the map with it. */
  card?: boolean;
}
const NO_INSETS: MapInsets = { top: 0, bottom: 0, left: 0, out: false, up: false };

/** The page's insets, in a store of their own rather than MapPage's state:
 *  a change (the sheet settling, a card coming) is read by the map's own
 *  parts (GlMapShell, useGlFit) and written to the page's CSS variables
 *  (insetVars), where as MapPage's state it drew the whole page again. */
export const useMapInsets = create<MapInsets>(() => NO_INSETS);

/** The panel's measurement (MapPanel's onInsetsChange), kept when it has
 *  not changed, so one that comes out the same tells nobody. */
export function setMapInsets(next: MapInsets) {
  const prev = useMapInsets.getState();
  const same =
    prev.top === next.top &&
    prev.bottom === next.bottom &&
    prev.left === next.left &&
    prev.out === next.out &&
    prev.up === next.up &&
    prev.card === next.card;
  if (!same) useMapInsets.setState(next, true);
}

/** The insets as the map's element's CSS variables, for the chart credit
 *  (index.css): a ref, written now and at each change, never by a render. */
export function insetVars(el: HTMLElement | null) {
  if (!el) return;
  const write = (insets: MapInsets) => {
    el.style.setProperty("--map-inset-top", `${insets.top}px`);
    el.style.setProperty("--map-inset-bottom", `${insets.bottom}px`);
    el.style.setProperty("--map-inset-left", `${insets.left}px`);
  };
  write(useMapInsets.getState());
  return useMapInsets.subscribe(write);
}

/** The console's close where it is a layer of the map's panel rather
 *  than a sheet of its own -- on a phone (MapPage) -- for its header to
 *  put it away with (ConsoleHeader): with no sheet round it, it has no
 *  sheet's own close, title or description to use. */
export const ConsoleInPanelContext = createContext<{ close: () => void } | null>(null);

/** The panel's size as the tab bar sees it, and the way to change it
 *  (MapPanel). Null outside a panel. */
export const PanelSize = createContext<{
  size: PanelState;
  to: (size: PanelState) => void;
  /** A card in the pill (MapPanel's `cardInPill`): a tap on the tab up puts it away. */
  card: boolean;
} | null>(null);

/** Whether the console is out, the app's rather than a page's: the two
 *  pages are drawn anew as a developer's Pilot and Developer in its
 *  title (ConsoleHeader) change one for the other, and the console stays
 *  out across the change, the other page's in its place. Not kept past
 *  a reload. */
export const useConsoleOpen = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/**
 * What floats over the chart: translucent, the map showing through it
 * blurred, as iOS's materials are -- the panel, the map's buttons. On
 * the popover's grey in the dark theme, so it stands off a dark chart.
 */
export const MATERIAL =
  "bg-background/85 backdrop-blur-xl backdrop-saturate-150 dark:bg-popover/90 solid:bg-background solid:backdrop-blur-none solid:backdrop-saturate-100 dark:solid:bg-popover";

/**
 * iOS 26's Liquid Glass, for what floats over the chart at rest: the
 * panel's capsule and the map's buttons. Clearer than MATERIAL -- the
 * chart is there under it, blurred and brightened -- with a lit rim and
 * a soft shadow of its own (index.css, `liquid-glass`). It cannot bend
 * the chart at its edge as iOS's does: Safari will not run an SVG
 * filter behind an element.
 */
export const GLASS = "liquid-glass";

/** GLASS on a stock Card, whose own `bg-card` and shadow would otherwise
 *  win over it: the same glass, important, so the card keeps the map's
 *  see-through look (the weather flow's legend and timeline). */
export const GLASS_CARD = "liquid-glass!";

/** A floating card's material (FloatingCard): the sheet's ground nearly
 *  whole over a heavy frost (index.css's card-glass, material.card-fill
 *  and card-blur), nothing under it legible; solid under Reduce
 *  Transparency or Increase Contrast. */
export const CARD_GLASS = "card-glass";

/** The same glass for a sheet, frostier -- more of the material, less of
 *  the chart -- as what is on it is read: the console, the dialogs. */
export const GLASS_SHEET = "bg-[var(--sheet)] shadow-(--depth-sheet)";

/** The app's sheet-sized move, in seconds (design/tokens.json motion.sheet):
 *  a point picked flown to, own ship found. The map's sheet itself moves
 *  on the stock Drawer's own time (sheet/insets' DRAWER_MS), and
 *  the map follows it on that. */
export const SHEET_SECONDS = MOTION.sheet;

/** The same corners as a class, for every sheet drawn with classes: a
 *  phone's floating sheet (PhoneSheetContent). Written out whole, as
 *  Tailwind finds a class only as it is written. */
export const SHEET_CORNERS = "rounded-[var(--radius-sheet)]";
/** A box in the middle of the screen from `md` up, an iOS alert's corners
 *  (the sheets audit's D3, 2026-10-17): the dialogs and alerts. On a
 *  phone each is a sheet, with the sheet's corners. */
export const DIALOG_CORNERS = "rounded-[var(--radius-dialog)]";
/** What is behind every sheet and dialog, one dimming for all of them (the
 *  sheet consolidation, 2026-10-27): the page a tenth darker and lightly
 *  blurred, half in the dark theme, where the dialogs dimmed it a fifth
 *  or a half and the sheets a tenth. */
export const DIM = "bg-black/10 dark:bg-black/50 supports-backdrop-filter:backdrop-blur-xs solid:backdrop-blur-none";
/** The panel at rest, its tabs and the route's figures: a rectangle with
 *  round corners, at the pilot's ask ("more of a rectangle"), where it was
 *  a capsule, its ends half its height round. */
export const PILL_RADIUS = 24;

/** The margin a card keeps from the screen's edges, and a phone's sheet
 *  from the far one. */
export const SHEET_MARGIN = 8;

/** The same glass tinted the blue on a toggle's chip once it is picked
 *  (data-pressed) -- a field's runway (ProceduresRoute) -- as iOS 26's
 *  prominent glass is for the one choice that sets something: the tint
 *  through it, white words, the light at its top and its rim the clear
 *  glass's. Written out per state, as Tailwind finds its classes by their
 *  whole names. */
export const GLASS_PICKED =
  "data-pressed:bg-primary data-pressed:font-semibold data-pressed:text-primary-foreground hover:data-pressed:bg-primary hover:data-pressed:text-primary-foreground";

/** A chip's words on the panel's row (the airplane, the cruising altitude,
 *  the time): a note's 13 to a finger, as Maps' route options are, growing
 *  with the reader's text size only to 14, so the row stays one line at
 *  the pilot's, a step up from iOS's default. */
export const CHIP_TEXT = "text-xs pointer-coarse:text-[min(0.8125rem,14px)]";

/** A tinted capsule that adds a field to the route -- the Stops' Add
 *  Stop and Direct To (StopsCard) -- one height, padding and hit area (the
 *  consistency audit, 2026-10-23): 32 points with a 44-point area round
 *  it as a pseudo-element, so the capsule is not grown to make it. */
export const ADD_CAPSULE =
  "relative h-8 shrink-0 rounded-full bg-tint/12 px-3.5 font-semibold text-tint outline-none " +
  `after:absolute after:-inset-1.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring ${TEXT.detail}`;

/** A star filled in iOS's yellow, as a starred thing is everywhere on
 *  iOS: the airport card's star, a round button by its close. */
export const FAVORITE_STAR_ON = "fill-(--brand-taxiway-yellow) text-(--brand-taxiway-yellow)";

/** Whether the map panel is between sizes (MapPanel): dragged, or on its
 *  way to a size. A card shown at the pill's size as its
 *  summary is drawn in full in the panel's body while a finger takes it
 *  up, so the sheet grows with the card in it, not an empty band over the
 *  summary that changed into the card at the release; and easing down, the
 *  body stays as it was until the sheet is the pill. */
export const usePanelDragging = create<{ dragging: boolean }>(() => ({ dragging: false }));

/** A map button in flight (useFlyingMode, MapControls): 60 points, the
 *  size the canvas's Flying screen draws them (2026-11-03), a word on it
 *  in the tint -- a target for a hand in turbulence, where the 36-point
 *  glyphs are a desk's. One size for the whole stack, the microphone's
 *  circle included, set on the stack rather than each button. */
export const FLYING_STACK = "gap-3 [&_button]:size-[60px]";
export const FLYING_BUTTON = "rounded-full font-bold text-tint";

/** Flying mode, as the planner sets it (useFlyingMode) for the map's
 *  chrome to read: whether it is on, and what its two big buttons do --
 *  Nearest's list and direct to the next landing -- which are the
 *  planner's to give. Off with nothing to do until a route is flown. */
export const useFlying = create<{
  flying: boolean;
  /** Done flying tapped on this flight: off until the ground. */
  stopped: boolean;
  nearest: (() => void) | null;
  direct: { to: string; go: () => void } | null;
}>(() => ({ flying: false, stopped: false, nearest: null, direct: null }));
