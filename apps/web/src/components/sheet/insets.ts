import type { Drawer } from "@base-ui/react/drawer";
import { SHEET_MARGIN, type MapInsets, type PanelState } from "../../lib/mapChrome";
import { REACH } from "../../lib/sheetCards";
import { MOTION, SIZE } from "../../lib/tokens";

/** How long the stock Drawer takes to settle, ms: the time and curve of
 *  Base UI's own drawer demo (design/tokens.json motion.drawer and
 *  drawer-ease), which MapPanel's popup class runs, and the map follows
 *  the sheet on. */
export const DRAWER_MS = MOTION.drawer * 1000;

/**
 * The sheet's three snap points in the stock Drawer's own units, the same
 * for the sheet and every card over it (the owner, 2026-11-11: the
 * detents felt buggy while they were px worked out from the window's
 * height, which Safari's toolbar changes, and from what the sheet held).
 * Fixed values: the Drawer measures its viewport and its popup and puts
 * each where it belongs, and a render never hands it a new number.
 *
 * - The pill: the one search's band with the grabber over it, 4.25 rem on
 *   a bottom sheet (SheetParts' barRowPad: the grabber's 16-point room, the
 *   least iOS keeps, the 46-point field, six under: the owner, 2026-11-13,
 *   "taking minimal space"); on a top sheet the band's 4.25 rem and the
 *   grabber's own 1 rem row under it, 5.25 rem. Standing on the screen's
 *   foot (the home indicator's inset), nothing under it: the pages' tab
 *   bar it stood on is one round toggle in its first row (PageToggle; the
 *   owner, 2026-11-13). One value for every page and card, never one a
 *   page: FPL's pill is the route's figures (the owner, 2026-11-11), a
 *   name's 18-point line over a value's 25, 2.6875 rem, which under the
 *   grabber's 1 rem and over the sheet's 8-point edge (where there is no
 *   home indicator) is 4.1875 rem: it fits, so the pill stays the
 *   search's 4.25; a card's pill is its title row with its short line
 *   under the name (PinnedHead), as tall.
 * - Half: 23 rem, the owner's ("Let's make the half card this tall", their
 *   iPhone's sheet 368 points tall: the route's box, its chips, the side
 *   view and the figures).
 * - All the way up: 1, the whole of the Drawer's viewport, which the popup's
 *   own height (MapPanel) keeps clear of the status bar.
 */
const BOTTOM_SNAPS: Readonly<Record<PanelState, Drawer.Root.SnapPoint>> = { peek: "4.25rem", half: "23rem", full: 1 };
const TOP_SNAPS: Readonly<Record<PanelState, Drawer.Root.SnapPoint>> = { ...BOTTOM_SNAPS, peek: "5.25rem" };
const BOTTOM_POINTS = [BOTTOM_SNAPS.peek, BOTTOM_SNAPS.half, BOTTOM_SNAPS.full];
const TOP_POINTS = [TOP_SNAPS.peek, TOP_SNAPS.half, TOP_SNAPS.full];
const SIZES: PanelState[] = ["peek", "half", "full"];

/**
 * A sheet's or a card's body at the pill, the one rule for every surface
 * (SheetParts, CardStack): out of sight (a card's or a page alone: its
 * title row kept in sight, data-sheet-head, AT_PILL), laid out at the full height but hidden -- and drawn again the
 * moment a finger takes the sheet (Base UI's data-swiping on the popup,
 * the group/sheet), so it comes into sight as the sheet rises, as Apple
 * Maps' card does. The pill is the settled snap point, which only changes
 * once the finger lifts: hidden by it alone, the body under the title stayed
 * blank all through a drag up and appeared at the let-go (the owner's
 * iPhone, 2026-11-12, KORD's card; in WebKit at 390x844 none of its 23
 * parts in sight painted at any step of the drag). `visibility` keeps it
 * laid out and its pictures loaded, so there is nothing to build mid-drag.
 */
export const PILL_BODY = "invisible group-data-swiping/sheet:visible";
/** And a body that is the pill's one surface: its title row kept in sight. */
export const AT_PILL = `${PILL_BODY} [&_[data-sheet-head]]:visible`;

/** A sheet's snap points and each size's, one constant per edge. */
export function snapsOf(fromBottom: boolean) {
  return fromBottom ? { at: BOTTOM_SNAPS, points: BOTTOM_POINTS } : { at: TOP_SNAPS, points: TOP_POINTS };
}

/** The size the Drawer let go at: its snap point is one of ours, by
 *  identity, so no measure is matched to the nearest. */
export function sizeAt(fromBottom: boolean, point: Drawer.Root.SnapPoint): PanelState | undefined {
  const { at } = snapsOf(fromBottom);
  return SIZES.find((size) => Object.is(at[size], point));
}

/**
 * A drag let go, the sheet's or a card's (MapPanel, CardStack), as the
 * Drawer tells it (onSnapPointChange): the size of the snap point it
 * picked, one of ours, asked for. Let go past the pill (no snap point),
 * the Drawer reads a close, refused here before it starts one, and the
 * surface goes to the pill (`park`: half for a settings card) -- let
 * through, the close had begun, the card faded out and dropped off the
 * screen's foot before onOpenChange took it back, and it faded in again
 * at the pill (the flicker audit, 2026-11-14, FL-3). A settings card at
 * half (`close`) is the one that closes on a swipe down, the Drawer's own
 * close carrying it, and down to a lower size too.
 */
export function letGo(
  point: Drawer.Root.SnapPoint | null,
  details: Pick<Drawer.Root.SnapPointChangeEventDetails, "cancel">,
  s: { fromBottom: boolean; at: PanelState; ask: (size: PanelState) => void; park: PanelState; close?: () => void },
) {
  if (point === null) {
    if (s.close) return;
    details.cancel();
    if (s.park !== s.at) s.ask(s.park);
    return;
  }
  const target = sizeAt(s.fromBottom, point);
  if (!target || target === s.at) return;
  if (s.close && REACH[target] < REACH[s.at]) s.close();
  else s.ask(target === "peek" ? s.park : target);
}

/**
 * How much of a sheet or a card is in sight at rest at `size`, px, as the
 * stock Drawer resolves its snap point (useDrawerSnapPoints, @base-ui/react
 * 1.9.0: a rem value at the page's root font size, a fraction of its
 * viewport, either no taller than the popup; the viewport is never shorter
 * than the popup here, MapPanel's height). Worked out from the size the
 * page holds, not read off a popup: Base UI writes its offset as 0 until it
 * has measured, which read as the whole card in sight for a frame as one
 * opened (the flicker audit, 2026-11-14, FL-4).
 */
export function shownPx(size: PanelState, fromBottom: boolean, popupHeight: number, rem = rootRem()) {
  const point = snapsOf(fromBottom).at[size];
  return typeof point === "number" ? popupHeight : Math.min(parseFloat(point) * rem, popupHeight);
}

/** The page's root font size, px, which the Drawer's rem snap points use. */
function rootRem() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/** The side panel's width from `md` up (design/tokens.json size.panel),
 *  and a desktop's from 1024 wide (panel-wide). */
export const CARD = SIZE.panel;
export const CARD_WIDE = SIZE.panelWide;

/** From `md` up the side panel floats this far inside the window's top
 *  and left, its four corners round, as Maps' card does on an iPad and a
 *  Mac (the owner's screenshot, 2026-11-06: the tabs ran into the
 *  window's top). */
export const FLOAT_PX = 16;

/**
 * What the panel covers of the map at `s`, for fitting a route to the
 * room it leaves (GlMapShell, the "map follows the sheet" rules): on a
 * phone the strip the sheet in sight covers (`cover`, read from the
 * Drawer: the pill's at rest, half's from half and all the way up, where
 * what counts is what shows once it comes down); from `md` up the side
 * panel's column while it is out, or the corner its head (`cover`, its
 * height at rest) rests in.
 *
 * The screen's top under a sheet from the bottom is the status bar's and
 * the Dynamic Island's (`safeTop`, env(safe-area-inset-top)): kept out of
 * the map's room, as HIG's layout keeps content inside the safe area,
 * where a fit put KOSH at y = 38 under it (the FPL audit's A11). A sheet
 * from the top covers it.
 */
export function insetsOf(s: PanelState, cover: number, onPhone: boolean, fromBottom: boolean, safeTop = 0, wide = false): MapInsets {
  const up = s === "full";
  if (!onPhone) {
    if (s !== "peek") return { top: safeTop, bottom: 0, left: FLOAT_PX + (wide ? CARD_WIDE : CARD), out: true, up };
    return { top: cover + SHEET_MARGIN + FLOAT_PX, bottom: 0, left: 0, out: false, up };
  }
  return fromBottom
    ? { top: safeTop, bottom: cover, left: 0, out: s !== "peek", up }
    : { top: cover, bottom: 0, left: 0, out: s !== "peek", up };
}
