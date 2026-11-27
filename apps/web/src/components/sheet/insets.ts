import type { Drawer } from "@base-ui/react/drawer";
import { feel } from "../../lib/haptics";
import { SHEET_MARGIN, type MapInsets, type PanelState } from "../../lib/mapChrome";
import { REACH } from "../../lib/sheetCards";
import { MOTION, SIZE } from "../../lib/tokens";
import { SWIPE_READER } from "./sheetFollow";

/** How long the stock Drawer takes to settle, ms: the time and curve of
 *  Base UI's own drawer demo (design/tokens.json motion.drawer and
 *  drawer-ease), which MapPanel's popup class runs, and the map follows
 *  the sheet on. */
export const DRAWER_MS = MOTION.drawer * 1000;

/** The Drawer's settle after a lift, and a frame to spare: how long what
 *  follows the sheet keeps following once the finger is off. */
export const SETTLE_MS = DRAWER_MS + 50;

/**
 * The sheet's three snap points in the stock Drawer's own units, the same
 * for the sheet and every card over it (the owner, 2026-11-11: the
 * detents felt buggy while they were px worked out from the window's
 * height, which Safari's toolbar changes, and from what the sheet held).
 * Fixed values: the Drawer measures its viewport and its popup and puts
 * each where it belongs, and a render never hands it a new number.
 *
 * - The pill: the one search's band with the grabber over it, 4.25 rem on
 *   a bottom sheet (SheetHead's barRowPad: the grabber's 16-point room, the
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
/** The pill: a card's title row with its room, as the search's band. */
export const PILL_HEIGHT = "4.25rem";
const BOTTOM_SNAPS: Readonly<Record<PanelState, Drawer.Root.SnapPoint>> = { peek: PILL_HEIGHT, half: "23rem", full: 1 };
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
 * Nothing in it eases its visibility: the stock Button lists what it eases
 * (no longer shadcn's transition-all, which eased visibility too and kept
 * FPL's ••• over the pill's figures for its transition's time, the owner's
 * screen recording of 2026-11-16), so no rule here stops its children's
 * transitions any more.
 */
export const PILL_BODY = "invisible group-data-swiping/sheet:visible";
/** And a body that is the pill's one surface: its title row kept in sight,
 *  and only the row: what a head shows under its name (CardHead's `below`,
 *  the Brief's verdict) is not laid out there, as it made the head taller
 *  than the pill's room and pushed the row's ✕ off the screen's foot. */
export const AT_PILL = `${PILL_BODY} [&_[data-sheet-head]]:visible [&_[data-head-below]]:hidden`;

/** What a sheet shows risen where its pill is not simply its top (FPL's
 *  bar and route, over the foot bar's figures, the pill: sheet/FootBar): laid out at the pill but out
 *  of sight (PILL_BODY), in sight as the finger takes it and held till the
 *  sheet has settled (the popup's data-risen, SheetDrawer), all in CSS,
 *  nothing built or swapped mid-drag -- the airport card's way. */
export const RISEN_FACE = `${PILL_BODY} group-data-risen/sheet:visible`;
/** Eight points at a bottom sheet's foot where there is no home indicator
 *  (its viewport ends over the indicator, SheetDrawer), none while the
 *  keyboard is up: the Drawer's --drawer-keyboard-inset is 0 or a
 *  keyboard's height, so the room less a thousand times it is the room or
 *  nothing. SheetParts' spacer at the foot; a floating bar in the foot
 *  takes some of it back (FplTabBar). */
export const EDGE_ROOM = "max(0px, calc(8px - env(safe-area-inset-bottom) - var(--drawer-keyboard-inset, 0px) * 1000))";

/** The room under a card's content (SheetCard), 16 points or the home
 *  indicator's inset: its last row clear of the screen's foot. A card's
 *  floating tab bar in the card (CardTabBar, beside the side panel and on
 *  a top sheet) takes it back, so the bar rests in the same place scrolled
 *  to the end as it does pinned; on a phone's bottom sheet, where the bar
 *  stands in the card's foot slot (sheet/CardFoot), the slot's height is
 *  the room in its place (SheetCard). */
export const CARD_FOOT_ROOM = "max(1rem, env(safe-area-inset-bottom))";

/** What slides with a sheet, the popup and what is held against its slide:
 *  eased under Reduce Motion too (index.css), as iOS keeps a sheet's slide
 *  there -- a move along one axis that the pilot made, not the zoom or
 *  parallax the setting is for -- where it jumped between its sizes and
 *  the pilot lost where it went (the apple-design audit of 2026-11-23, M5;
 *  the owner took the recommendation). */
export const SHEET_SLIDE = "sheet-slide";

/** Held at a sheet's free edge however far the sheet is slid: moved back by
 *  the Drawer's snap offset and the finger's movement, on its curve, held
 *  still under a finger -- the foot in flight, in a dry run and on a top
 *  sheet (SheetFoot; FPL's on the ground is sheet/FootBar, outside the
 *  popup), a card's tabs (CardTabBar), sticky at its scroller's foot. Its offset read
 *  through the popup's own copy (--sheet-offset, SheetDrawer and
 *  CardStack), the finger's movement handed to it alone (SWIPE_READER,
 *  sheet/sheetFollow): Base UI registers its variables with `inherits:
 *  false`, so under the popup they were 0 and nothing followed -- a top
 *  sheet's search rode off the screen at the pill (consoles.spec,
 *  2026-11-10). The two terms cancel the popup's own transform exactly at
 *  every frame of its ease, both on one curve from one start. 0 beside
 *  the side panel. */
export const HOLD_AT_EDGE = `[transform:translateY(calc(-1*(var(--sheet-offset,0px)+var(--sheet-swipe,0px))))] transition-transform duration-(--motion-drawer) ease-(--motion-drawer-ease) group-data-swiping/sheet:transition-none ${SWIPE_READER} ${SHEET_SLIDE}`;

type Snaps = { at: Readonly<Record<PanelState, Drawer.Root.SnapPoint>>; points: Drawer.Root.SnapPoint[] };
/** The last FPL pill's snap points, kept so a render hands the Drawer the same array. */
let footPillSnaps: { px: number; snaps: Snaps } | null = null;

/**
 * A sheet's snap points and each size's, one constant per edge -- but for
 * FPL's pill on a phone's bottom sheet (`pillPx`, footPillPx), whose
 * height is the foot bar's own at the pill and the grabber's room, so the
 * sheet stands behind the bar there with its grabber alone over it.
 */
export function snapsOf(fromBottom: boolean, pillPx = 0): Snaps {
  if (!fromBottom) return { at: TOP_SNAPS, points: TOP_POINTS };
  if (pillPx <= 0) return { at: BOTTOM_SNAPS, points: BOTTOM_POINTS };
  if (footPillSnaps?.px !== pillPx) {
    const at = { ...BOTTOM_SNAPS, peek: `${pillPx}px` };
    footPillSnaps = { px: pillPx, snaps: { at, points: [at.peek, at.half, at.full] } };
  }
  return footPillSnaps.snaps;
}

/**
 * FPL's pill, px, from the foot bar's height folded at the pill (`barPx`,
 * sheet/FootBar, 0 until measured): the bar and the grabber's 1 rem room
 * over it, so the pill shows the bar's strip and the grabber, nothing of
 * the sheet's head. A rem pill was the bar's 3.25 rem and the grabber's 1
 * only while the Drawer's root size was the page's: Base UI 1.9.0 reads
 * the root's font size only when its viewport is resized
 * (useDrawerSnapPoints), where lib's Dynamic Type sets it again as the page
 * comes back from the background, and a larger text size grows the bar
 * past 3.25 rem (FlightFoot's min-height); the owner's iPhone rested at
 * the pill once with the head half over the bar and once without (its
 * recording, 2026-11-23). In px from the bar measured, its own resize
 * tells the Drawer anew.
 */
export function footPillPx(barPx: number, rem = rootRem()): number {
  return barPx > 0 ? Math.round(barPx + rem) : 0;
}

/** The size the Drawer let go at: its snap point is one of ours, by
 *  identity, so no measure is matched to the nearest. */
export function sizeAt(fromBottom: boolean, point: Drawer.Root.SnapPoint, pillPx = 0): PanelState | undefined {
  const { at } = snapsOf(fromBottom, pillPx);
  return SIZES.find((size) => Object.is(at[size], point));
}

/**
 * A drag let go, the sheet's or a card's (MapPanel, CardStack), as the
 * Drawer tells it (onSnapPointChange): the size of the snap point it
 * picked, one of ours, asked for. With no `close` (the main sheet), let
 * go past the pill (no snap point) the Drawer reads a close, refused here
 * before it starts one, so it never begins to fade out (the flicker audit,
 * 2026-11-14, FL-3), and the sheet goes to `park`. With a `close` (a card
 * at half), a swipe down closes it, the Drawer's own close carrying it,
 * and so does one down to a lower size.
 */
export function letGo(
  point: Drawer.Root.SnapPoint | null,
  details: Pick<Drawer.Root.SnapPointChangeEventDetails, "cancel">,
  s: { fromBottom: boolean; pillPx?: number; at: PanelState; ask: (size: PanelState) => void; park: PanelState; close?: () => void },
) {
  // A light tick as a swipe lands the sheet or a card at another size, as
  // iOS's sheet gives one (lib/haptics: Chrome on Android; Safari has
  // none): from the pilot's own drag alone, not as the app raises it (the
  // r5-ui audit's L8).
  if (point === null) {
    if (s.close) return;
    details.cancel();
    if (s.park !== s.at) {
      feel("detent");
      s.ask(s.park);
    }
    return;
  }
  const target = sizeAt(s.fromBottom, point, s.pillPx);
  if (!target || target === s.at) return;
  feel("detent");
  if (s.close && REACH[target] < REACH[s.at]) s.close();
  else s.ask(target === "peek" ? s.park : target);
}

/**
 * How much of a sheet or a card is in sight at rest at `size`, px, as the
 * stock Drawer resolves its snap point (useDrawerSnapPoints, @base-ui/react
 * 1.9.0: a px value as it is, a rem value at the page's root font size, a fraction of its
 * viewport, either no taller than the popup; the viewport is never shorter
 * than the popup here, MapPanel's height). Worked out from the size the
 * page holds, not read off a popup: Base UI writes its offset as 0 until it
 * has measured, which read as the whole card in sight for a frame as one
 * opened (the flicker audit, 2026-11-14, FL-4).
 */
export function shownPx(size: PanelState, fromBottom: boolean, popupHeight: number, rem = rootRem(), pillPx = 0) {
  const point = snapsOf(fromBottom, pillPx).at[size];
  if (typeof point === "number") return popupHeight;
  return Math.min(parseFloat(point) * (point.endsWith("px") ? 1 : rem), popupHeight);
}

/** The page's root font size, px, which the Drawer's rem snap points use. */
function rootRem() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/** The side panel's width from `md` up (design/tokens.json size.panel),
 *  before it is measured: the room the map is fitted beside until then. */
export const CARD = SIZE.panel;

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
 * panel's column while it is out, its measured width (`side`), or the
 * corner its head (`cover`, its height at rest) rests in. The width was
 * the token's by the pointer, 384 for a touch screen, while the CSS drew
 * the wide 448 from 1024 on every screen: on a 13-inch iPad the map was
 * fitted 64 px under the panel (the iPad audit, 2026-11-21). And `right`,
 * the inspector's column at the map's right while a card is in it
 * (MapPanel) and its float at the window's edge: the room ends at its
 * edge as it begins at the side panel's (ipad-layout.spec measures both),
 * where a second float left 16 px of map unused beside it.
 *
 * The screen's top under a sheet from the bottom is the status bar's and
 * the Dynamic Island's (`safeTop`, env(safe-area-inset-top)): kept out of
 * the map's room, as HIG's layout keeps content inside the safe area,
 * where a fit put KOSH at y = 38 under it (the FPL audit's A11). A sheet
 * from the top covers it.
 */
/** What the inspector's column, `column` wide, covers at the map's right:
 *  the column and its float at the window's edge, the map's room ending at
 *  the column's edge as it begins at the side panel's (ipad-layout.spec). */
export const inspectorRoom = (column: number) => column + FLOAT_PX;

export function insetsOf(s: PanelState, cover: number, onPhone: boolean, fromBottom: boolean, safeTop = 0, side = 0, right = 0): MapInsets {
  const up = s === "full";
  if (!onPhone) {
    const inspector = right ? { right: inspectorRoom(right) } : {};
    if (s !== "peek") return { top: safeTop, bottom: 0, left: FLOAT_PX + (side || CARD), out: true, up, ...inspector };
    return { top: cover + SHEET_MARGIN + FLOAT_PX, bottom: 0, left: 0, out: false, up, ...inspector };
  }
  return fromBottom
    ? { top: safeTop, bottom: cover, left: 0, out: s !== "peek", up }
    : { top: cover, bottom: 0, left: 0, out: s !== "peek", up };
}
