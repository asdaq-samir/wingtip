import { SHEET_MARGIN, type MapInsets, type PanelState } from "../../lib/mapChrome";
import { SIZE } from "../../lib/tokens";

/** How long the stock Drawer takes to settle, ms: the time and curve of
 *  Base UI's own drawer demo (450 ms, cubic-bezier(0.32, 0.72, 0, 1)),
 *  which MapPanel's popup class runs, and the map follows the sheet on. */
export const DRAWER_MS = 450;

/** The sheet's three heights, in px from the screen's edge: its snap
 *  points on a phone (Base UI's Drawer), the side panel's rests elsewhere. */
export type Detents = Record<PanelState, number>;

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
 * phone the pill's strip, or the half sheet -- all the way up as well,
 * where what counts is what shows once it comes down; from `md` up the
 * side panel's column while it is out, or the corner its head rests in.
 *
 * The screen's top under a sheet from the bottom is the status bar's and
 * the Dynamic Island's (`safeTop`, env(safe-area-inset-top)): kept out of
 * the map's room, as HIG's layout keeps content inside the safe area,
 * where a fit put KOSH at y = 38 under it (the FPL audit's A11). A sheet
 * from the top covers it.
 */
export function insetsOf(s: PanelState, d: Detents, onPhone: boolean, fromBottom: boolean, safeTop = 0, wide = false): MapInsets {
  const up = s === "full";
  if (!onPhone) {
    if (s !== "peek") return { top: safeTop, bottom: 0, left: FLOAT_PX + (wide ? CARD_WIDE : CARD), out: true, up };
    return { top: d.peek + SHEET_MARGIN + FLOAT_PX, bottom: 0, left: 0, out: false, up };
  }
  const strip = s === "peek" ? d.peek : d.half;
  return fromBottom
    ? { top: safeTop, bottom: strip, left: 0, out: s !== "peek", up }
    : { top: strip, bottom: 0, left: 0, out: s !== "peek", up };
}
