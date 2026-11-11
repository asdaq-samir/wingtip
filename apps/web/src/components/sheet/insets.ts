import type { Drawer } from "@base-ui/react/drawer";
import { SHEET_MARGIN, type MapInsets, type PanelState } from "../../lib/mapChrome";
import { SIZE } from "../../lib/tokens";

/** How long the stock Drawer takes to settle, ms: the time and curve of
 *  Base UI's own drawer demo (450 ms, cubic-bezier(0.32, 0.72, 0, 1)),
 *  which MapPanel's popup class runs, and the map follows the sheet on. */
export const DRAWER_MS = 450;

/**
 * The sheet's three snap points in the stock Drawer's own units, the same
 * for the sheet and every card over it (the owner, 2026-11-11: the
 * detents felt buggy while they were px worked out from the window's
 * height, which Safari's toolbar changes, and from what the sheet held).
 * Fixed values: the Drawer measures its viewport and its popup and puts
 * each where it belongs, and a render never hands it a new number.
 *
 * - The pill: the one search's band with the grabber over it, 4.75 rem on
 *   a bottom sheet (SheetParts' barRowPad: the grabber's 24-point room, the
 *   46-point field, six under); on a top sheet the band's 4.25 rem and the
 *   grabber's own 1 rem row under it, 5.25 rem. The route's row at the
 *   pill (the FPL page's) has the same band.
 * - Half: 23 rem, the owner's ("Let's make the half card this tall", their
 *   iPhone's sheet 368 points tall: the route's box, its chips, the side
 *   view and the figures).
 * - All the way up: 1, the whole of the Drawer's viewport, which the popup's
 *   own height (MapPanel) keeps clear of the status bar.
 */
const BOTTOM_SNAPS: Readonly<Record<PanelState, Drawer.Root.SnapPoint>> = { peek: "4.75rem", half: "23rem", full: 1 };
const TOP_SNAPS: Readonly<Record<PanelState, Drawer.Root.SnapPoint>> = { ...BOTTOM_SNAPS, peek: "5.25rem" };
const BOTTOM_POINTS = [BOTTOM_SNAPS.peek, BOTTOM_SNAPS.half, BOTTOM_SNAPS.full];
const TOP_POINTS = [TOP_SNAPS.peek, TOP_SNAPS.half, TOP_SNAPS.full];
const SIZES: PanelState[] = ["peek", "half", "full"];

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

/** Half's height in px as the Drawer resolves it ("23rem", no taller than
 *  the popup), for the map's room all the way up: what shows once it comes
 *  down. */
export function halfPx(popupHeight: number) {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.min(parseFloat(String(BOTTOM_SNAPS.half)) * rem, popupHeight);
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
