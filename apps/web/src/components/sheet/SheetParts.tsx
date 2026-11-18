import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { cn } from "cn";
import { PanelSize, type PanelState } from "../../lib/mapChrome";
import TabKept from "../TabKept";
import { AT_PILL, HOLD_AT_EDGE, PILL_BODY, RISEN_FACE } from "./insets";
import { SheetPage } from "./SheetPages";
import type { SheetPages } from "../../lib/sheetPages";

/** The first row's room under the grabber: ten points, the grabber's bar
 *  in it four from the edge. */
import { PointerTapDiv } from "./PointerTapDiv";
const ROW_PAD = "pt-2.5";
/** The one search's row, its 46-point field (OneSearchField) sixteen in
 *  from either side as everything in the sheet is (the sheet audit's
 *  F-P1, F-P2, 2026-11-10): on a bottom sheet under the grabber's 16-point
 *  room (SheetGrabber, the least iOS keeps: the owner, 2026-11-13) and six
 *  over its foot, 68 (BAR_ALONE); else ten over it and twelve under, 68
 *  (BAR). The pill is this row alone: the title row
 *  over it went for the map's room (the owner, 2026-11-10). */
function barRowPad(underGrabber: boolean) {
  if (underGrabber) return "h-[4.25rem] pt-4 pb-1.5";
  return cn("h-[4.25rem] pb-3", ROW_PAD);
}
/** Eight points at a bottom sheet's foot where there is no home indicator
 *  (its viewport ends over the indicator, SheetDrawer), none while the
 *  keyboard is up: the Drawer's --drawer-keyboard-inset is 0 or a
 *  keyboard's height, so the room less a thousand times it is the room or
 *  nothing. */
const EDGE_ROOM = "max(0px, calc(8px - env(safe-area-inset-bottom) - var(--drawer-keyboard-inset, 0px) * 1000))";
/** A bottom sheet's pill under its grabber's 1 rem room: the 4.25 rem
 *  snap point's rest (sheet/insets), where the figures sit at the pill. */
const PILL_BELOW_GRABBER = "3.25rem";
/** Those rows' heights, for what pins under them (--sheet-head). */
const BAR_ALONE = "4.25rem";
const BAR = "4.25rem";

/** Under the head, the body and the foot a shade darker than the glass
 *  over them, the grey of notes and the blue of tappable words a step
 *  darker on it for WCAG's 4.5:1 (design/tokens.json's -shade tokens). */
/** The head band's ground where nothing scrolls under it: a phone's sheet
 *  at the pill and half, whose body does not scroll (index.css's one
 *  scrolling rule), so the frost would blur the sheet's own flat colour
 *  into the same colour. Solid there, not frosted: iPhone Safari redrew a
 *  backdrop-filter under the route's card every frame the sheet slid, and
 *  a slow drag up from half drew the card in fine horizontal stripes, its
 *  idents smeared (the owner's iPhone, 2026-11-17). Frosted all the way
 *  up, where the body scrolls on under it. */
const SOLID_BAND = "bg-(--sheet)";
/** The band all the way up: frosted only settled there, where the body
 *  scrolls under it, and the sheet's solid ground while it moves -- a
 *  finger on it (Base UI's data-swiping) and on till it has settled
 *  (data-risen, SheetDrawer). Picked by the settled size alone, a slow
 *  drag down from all the way up kept the frost, the backdrop-filter
 *  Safari redraws under the card every frame of a slide, the stripes'
 *  cause (the owner's list, 2026-11-18). */
const FULL_BAND = cn(
  "frost-head",
  "group-data-swiping/sheet:bg-(--sheet) group-data-swiping/sheet:[-webkit-backdrop-filter:none] group-data-swiping/sheet:[backdrop-filter:none]",
  "group-data-risen/sheet:bg-(--sheet) group-data-risen/sheet:[-webkit-backdrop-filter:none] group-data-risen/sheet:[backdrop-filter:none]",
);
/** A band risen with the sheet from the pill: on its ground, and over the body, as at half. */
const RISEN_BAND =
  "group-data-swiping/sheet:bg-(--sheet) group-data-risen/sheet:bg-(--sheet) group-data-swiping/sheet:z-20 group-data-risen/sheet:z-20";

export const SHEET_BELOW = "[--muted-foreground:var(--muted-foreground-shade)] [--tint:var(--tint-shade)] print:bg-transparent";

export interface PartsProps {
  top: ReactNode;
  kept?: ReactNode;
  controls?: ReactNode;
  compact?: ReactNode;
  bar?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
  layer: "tab" | "card";
  flying: boolean;
  size: PanelState;
  atPill: boolean;
  /** The pill at rest: the body out of sight and of the keyboard's reach. */
  resting: boolean;
  /** A phone's bottom sheet (else a top sheet or the side panel). */
  fromBottom: boolean;
  onPhone: boolean;
  desktop: boolean;
  footShown: boolean;
  cardsUp: boolean;
  barShown: boolean;
  toEdge: boolean;
  panelSize: { size: PanelState; to: (size: PanelState) => void; card: boolean };
  onFootTap: () => void;
  /** The sheet's two pages, Search and FPL, turned by the toggle at their
   *  first row's end (PageToggle, SheetPages). */
  pages?: SheetPages;
}

/** The body cut off at a bottom sheet's figures by the same offset. */
const CUT_BOTTOM = "[clip-path:inset(0_0_max(0px,calc(var(--sheet-offset,0px)+var(--sheet-swipe,0px)))_0)]";

/**
 * What the sheet holds, the same in the Drawer and the side panel: one
 * scroller, its head's band (the first row, the top row, the controls)
 * sticky at its top and the body under it, laid out at every size and cut
 * off where the sheet ends; and the route's figures pinned at its foot --
 * in the pill its one row.
 *
 * The head is in the body's own scroller, `position: sticky; top: 0`,
 * frosted (frost-head), so what scrolls passes under it by the browser's
 * own layout: no height of it measured, no scroller pulled up under it.
 * A card, which has the sheet to itself (no search over it), is its own
 * scroller filling the room under an empty head, its title row sticky at
 * its top (PinnedHead) and its tabs under that. With the sheet's pages
 * each page is such a scroller, one up at a time (SheetPage):
 * Search's head the one search, FPL's its bar the same size (FplBar) and
 * the route's row under it.
 */
/** A tap on a pill's row raises the sheet, but not one on a control in it. */
function tapOpens(event: MouseEvent, open: () => void) {
  if (!(event.target instanceof Element) || !event.target.closest("button, a, input, [role=button]")) open();
}

export function SheetParts(p: PartsProps) {
  const { atPill, fromBottom, size, footShown, cardsUp } = p;
  const paged = !!p.pages;
  // Paged, the first page holds the search alone and the second its bar and
  // the route's row: no route row under the search.
  const headerShown = !paged && !p.flying && !cardsUp && (atPill ? !p.barShown : p.top != null || !p.barShown);
  const headContent = atPill ? p.compact : p.top;
  // Where the panel's top-right button sits, one place in every panel.
  const vars = {
    "--corner-line": "calc((2.875rem - 36px) / 2)",
    "--corner-inset": "calc(0.25rem + (2.875rem - 36px) / 2)",
  } as CSSProperties;
  const pillFoot = size === "peek" && !!(p.bar || p.compact);
  // The route's figures the pill's one row on a phone's bottom sheet.
  const figuresPill = pillFoot && footShown && p.onPhone && fromBottom && !p.flying;
  const bandOnly = !!p.bar && p.barShown && !headerShown;
  const barHeight = p.fromBottom ? BAR_ALONE : BAR;
  const sheetHead = bandOnly ? barHeight : "0px";
  // On a phone, what stays in sight at the sheet's free edge while the
  // popup, laid out at its full height, slides: moved back by the Drawer's
  // own offset and the finger's (its CSS variables), on its curve, and the
  // body cut off where those parts begin: the sheet's figures.
  const follows = p.onPhone ? HOLD_AT_EDGE : undefined;

  // A page's first row: the one search on Search, FPL's bar on FPL (its
  // twin, FplBar), one size on both, so a turn of the page moves nothing
  // and the map's room stays as it was (the owner, 2026-11-14).
  // `rises`: out of sight at the pill but laid out, coming into sight as a
  // finger takes the sheet (RISEN_FACE), where it is not the pill's own.
  const barRowOf = (bar: ReactNode, shown: boolean, hairline: boolean, rises = false) => (
    <div
      className={cn(
        "flex shrink-0 px-4",
        barRowPad(p.fromBottom),
        !shown && (rises ? RISEN_FACE : "hidden"),
        // All the way up on a phone the search alone is pinned at the
        // top, a hairline under it, as Apple Maps' is.
        hairline && p.onPhone && size === "full" && "border-b border-border",
      )}
    >
      <PanelSize.Provider value={p.panelSize}>{bar}</PanelSize.Provider>
    </div>
  );
  const barRow = p.bar && barRowOf(p.bar, p.barShown, true);
  // The route's row (or a workspace's head) and the controls under it: under
  // the search, or paged under FPL's bar.
  const headBlock = (shownAtRest: boolean, alone: boolean, rises = false) => {
    // Drawn at the pill too where it rises with the sheet, as at half.
    const risen = rises && !shownAtRest;
    const shown = shownAtRest || risen;
    const content = risen ? p.top : headContent;
    const keptHere = p.kept != null && shown && content === p.kept;
    return (
      <div
        className={cn(
          "relative flex flex-col",
          p.bar && p.barShown && (!atPill || risen) && SHEET_BELOW,
          ((!shown && p.kept == null) || alone) && "hidden",
          risen && RISEN_FACE,
        )}
      >
        {(shown || p.kept != null) && (
          <header
            className={
              !shown
                ? "contents"
                : cn(
                    "@container flex items-center gap-2 print:hidden",
                    atPill && !risen
                      ? cn("px-2.25 pb-3", ROW_PAD)
                      : p.top == null
                        ? undefined
                        : cn("px-3 pb-1", p.barShown ? "pt-1" : ROW_PAD),
                  )
            }
          >
            {/* The kept row first, in the one place whatever is shown, so
                it is never built again; out of sight inert and not laid
                out (tab-away). */}
            {p.kept != null && (
              <div className={keptHere ? "contents" : "tab-away pointer-events-none absolute"} inert={!keptHere}>
                {p.kept}
              </div>
            )}
            {shown && !keptHere && content}
          </header>
        )}
        {shown && (!atPill || risen) && p.controls && (
          <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-3 px-3 pt-1 print:hidden", "pb-1.5")}>{p.controls}</div>
        )}
      </div>
    );
  };

  // One scroller: its head's band sticky at its top and the body under it.
  // `alone`: a card or a page at the pill, with no search and no pill of its
  // own over it: its one title row (PinnedHead, data-sheet-head) shown in the
  // pill's room, the rest of it out of sight, a tap on the row raising it
  // back to half, as Apple Maps' place card at its smallest (the owner,
  // 2026-11-11: Settings dragged to the smallest size left the sheet empty).
  // `off`: a page out of sight beside the one up, its body inert.
  // `cut`: the figures pinned at its foot, so its body is cut off there.
  // `rises`: its band risen with the sheet from the pill (FPL's), frosted as at half from the finger's first move.
  const scroller = (band: ReactNode, body: ReactNode, alone: boolean, off: boolean, head: string, cut: boolean, rises = false) => (
    <div
      data-sheet-scroll=""
      // Where a list's pinned head sticks under the head band (PinnedHead):
      // the search's row, a fixed height, where that is all the band holds
      // (a tab's lists); none over a card, which has the sheet to itself.
      // A row focused or brought into view stops under the search's row,
      // not behind it (WCAG 2.4.11).
      style={{ "--sheet-head": head, scrollPaddingTop: head } as CSSProperties}
      className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto print:overflow-visible", p.onPhone && fromBottom && cut && CUT_BOTTOM)}
    >
      <PointerTapDiv
        data-head-band=""
        style={vars}
        // Risen from a pill that is a row of it (FPL's figures, held at the
        // foot), a tap on that row raises the sheet to half, as on the foot.
        onClick={rises ? (event) => tapOpens(event, p.onFootTap) : undefined}
        // Sticky at the scroller's top, frosted wherever the body runs on
        // up under it, the grabber's room inside it (the owner's iPhone,
        // 2026-11-11: clear, the list showed through the band); on a
        // phone only settled all the way up, solid below (SOLID_BAND) and
        // while it moves (FULL_BAND).
        className={cn(
          "sticky top-0 flex shrink-0 flex-col",
          !atPill ? cn("z-20", !p.onPhone ? "frost-head" : size !== "full" ? SOLID_BAND : FULL_BAND) : rises && RISEN_BAND,
        )}
      >
        {band}
      </PointerTapDiv>
      <PointerTapDiv
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          size !== "peek" && !fromBottom && "pb-4",
          SHEET_BELOW,
          cardsUp ? "invisible" : p.resting && (alone ? AT_PILL : PILL_BODY),
          !p.onPhone && size === "peek" && "hidden",
        )}
        inert={off || cardsUp || (p.resting && !alone)}
        data-panel-body=""
        // On a phone, Drawer.Content's own mark: a mouse dragged across the
        // body selects its words rather than moving the sheet (a finger
        // still moves it, where the body's lists are not scrolling).
        data-drawer-content={p.onPhone ? "" : undefined}
        onClick={p.resting && alone ? (event) => tapOpens(event, p.onFootTap) : undefined}
      >
        {/* Not put away under a card (TabKept's `away`): a card's content is
            drawn in it (SheetCard, the Brief, Settings) and opens while it
            is in sight (lib/shown). */}
        <TabKept away={false}>{body}</TabKept>
      </PointerTapDiv>
    </div>
  );

  // The route's figures pinned at the sheet's foot. Paged, FPL's own, at
  // its page's foot, put away with it while Search is up.
  const foot = !!p.foot && (footShown || cardsUp) && (
    <PointerTapDiv
      data-testid="panel-foot"
      className={cn(
        // One box at the pill and all the way up, the figures centred
        // in it at their large size; at half small, the box only as tall
        // as they are (the owner, 2026-11-05). What gives way in the
        // pill (data-pill-hides) is put away there. Over the scroller's
        // sticky head band (frost-head, z-20) as well as its body: FPL's
        // route timeline lives in that band, and at half it runs down past
        // the sheet's edge, where at z-10 it was drawn over the actions'
        // floating bar and hid it (the owner's iPhone, 2026-11-17).
        "relative z-30 flex shrink-0 flex-col justify-center border-t print:hidden",
        fromBottom && follows,
        // The figures as the pill's one row (FPL's, not flying): under
        // the grabber's 1 rem room, the rest of the pill's 4.25 rem
        // (sheet/insets) less the foot's edge room, the figures' 2.6875
        // rem (a name's 18-point line over a value's 25) centred in it.
        figuresPill
          ? "pt-0 pb-0"
          : cn(fromBottom || size !== "half" ? "pb-1" : "pb-4", size === "half" ? "min-h-0" : "min-h-[3.875rem]", ROW_PAD),
        p.layer === "card" ? "px-0" : "px-4",
        !footShown && "hidden",
        pillFoot ? "border-transparent [&_[data-pill-hides]]:hidden [&>*]:flex-none" : cn("border-border/60", SHEET_BELOW),
        // No hairline over a bar that floats (FPL's actions' glass bar on
        // the ground), as none is over a card's tabs (the owner, 2026-11-16:
        // "Why do I see a separator above the tabs bar?").
        p.pages?.floats && "border-transparent",
      )}
      style={
        {
          "--sheet-progress": size === "half" && !p.desktop ? "0" : "1",
          ...(p.toEdge && fromBottom && !pillFoot ? { paddingBottom: "10px" } : {}),
          ...(figuresPill ? { height: `calc(${PILL_BELOW_GRABBER} - ${EDGE_ROOM})` } : {}),
        } as CSSProperties
      }
      // In the pill a tap on it opens it half way.
      onClick={pillFoot ? p.onFootTap : undefined}
    >
      {p.foot}
    </PointerTapDiv>
  );

  let content: ReactNode;
  if (p.pages) {
    const { at, bar, second } = p.pages;
    // The second page's first row, its bar (FplBar), and the route's row
    // under it from half up; at the pill the route's figures in the bar's
    // place where there are some (the foot, MapPanel's footShown), else the
    // bar, as Search's pill is its bar.
    const planShown = !p.flying && !cardsUp && (!atPill || !footShown);
    const routeShown = !p.flying && !cardsUp && !atPill && p.top != null;
    const searchAlone = atPill && !p.flying && !p.barShown;
    const routeAlone = atPill && !p.flying && !planShown && !footShown;
    // At the pill whose face is the route's figures held on the foot's
    // edge (FplRoute), FPL's bar and route are laid out out of sight and
    // rise with the sheet (RISEN_FACE): the airport card's way, nothing
    // swapped as a finger takes it (the owner, 2026-11-16).
    const rises = atPill && footShown && !p.flying && !cardsUp && p.top != null;
    // One page up at a time (SheetPage), turned by its toggle (PageToggle);
    // the other kept, inert.
    content = (
      <div data-testid="sheet-pages" data-page={at} className="flex min-h-0 flex-1 flex-col print:block">
        <SheetPage at={0} up={at === 0}>
          {scroller(barRow, p.children, searchAlone, at !== 0, sheetHead, false)}
        </SheetPage>
        <SheetPage at={1} up={at === 1}>
          {scroller(
            <>
              {barRowOf(bar, planShown, false, rises)}
              {headBlock(routeShown, false, rises)}
            </>,
            second,
            routeAlone,
            at !== 1,
            "0px",
            footShown && !p.pages.floats,
            rises,
          )}
          {foot}
        </SheetPage>
      </div>
    );
  } else {
    const headAlone = atPill && !p.flying && !p.barShown && !(headerShown && headContent != null);
    content = scroller(
      <>
        {barRow}
        {headBlock(headerShown, headAlone)}
      </>,
      p.children,
      headAlone,
      false,
      sheetHead,
      footShown,
    );
  }

  return (
    <>
      {content}
      {!p.pages && foot}
      {/* A bottom sheet's eight points at its foot where there is no home
          indicator (in the body where it runs to the edge, toEdge); the
          indicator's own room is under the Drawer's viewport (SheetDrawer). */}
      {!p.toEdge && p.onPhone && fromBottom && <div className="shrink-0" style={{ height: EDGE_ROOM }} aria-hidden="true" />}
    </>
  );
}
