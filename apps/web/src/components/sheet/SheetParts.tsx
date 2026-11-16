import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";
import { PanelSize, type PanelState } from "../../lib/mapChrome";
import TabKept from "../TabKept";
import { AT_PILL, PILL_BODY } from "./insets";
import { SheetPage, type SheetPages } from "./SheetPages";

/** The first row's room under the grabber: ten points, the grabber's bar
 *  in it four from the edge. */
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

/** Back by the Drawer's snap offset and the finger's movement, on its
 *  curve, held still under a finger. Read through the popup's own copies
 *  (MapPanel's --sheet-offset and --sheet-swipe): Base UI registers its
 *  variables with `inherits: false`, so under the popup they were 0 and
 *  nothing followed -- a top sheet's search rode off the screen at the
 *  pill (consoles.spec, 2026-11-10). */
const FOLLOW =
  "[transform:translateY(calc(-1*(var(--sheet-offset,0px)+var(--sheet-swipe,0px))))] transition-transform duration-(--motion-drawer) ease-(--motion-drawer-ease) group-data-swiping/sheet:transition-none motion-reduce:transition-none";
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
  const follows = p.onPhone ? FOLLOW : undefined;

  // A page's first row: the one search on Search, FPL's bar on FPL (its
  // twin, FplBar), one size on both, so a turn of the page moves nothing
  // and the map's room stays as it was (the owner, 2026-11-14).
  const barRowOf = (bar: ReactNode, shown: boolean, hairline: boolean) => (
    <div
      className={cn(
        "flex shrink-0 px-4",
        barRowPad(p.fromBottom),
        !shown && "hidden",
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
  const headBlock = (shown: boolean, alone: boolean) => {
    const keptHere = p.kept != null && shown && headContent === p.kept;
    return (
      <div
        className={cn(
          "relative flex flex-col",
          p.bar && p.barShown && !atPill && SHEET_BELOW,
          ((!shown && p.kept == null) || alone) && "hidden",
        )}
      >
        {(shown || p.kept != null) && (
          <header
            className={
              !shown
                ? "contents"
                : cn(
                    "@container flex items-center gap-2 print:hidden",
                    atPill ? cn("px-2.25 pb-3", ROW_PAD) : p.top == null ? undefined : cn("px-3 pb-1", p.barShown ? "pt-1" : ROW_PAD),
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
            {shown && !keptHere && headContent}
          </header>
        )}
        {shown && !atPill && p.controls && (
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
  const scroller = (band: ReactNode, body: ReactNode, alone: boolean, off: boolean, head: string, cut: boolean) => (
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
      <div
        data-head-band=""
        style={vars}
        // Sticky at the scroller's top, frosted wherever the body runs on
        // up under it, the grabber's room inside it (the owner's iPhone,
        // 2026-11-11: clear, the list showed through the band).
        className={cn("sticky top-0 flex shrink-0 flex-col", !atPill && "frost-head z-20")}
      >
        {band}
      </div>
      {/* eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions -- a pointer convenience, not a control: the grabber is the keyboard's way to raise the sheet, and the card's own buttons stay focusable */}
      <div
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
        onClick={
          p.resting && alone
            ? (event) => {
                if (!(event.target instanceof Element) || !event.target.closest("button, a, input, [role=button]")) p.onFootTap();
              }
            : undefined
        }
      >
        {/* Not put away under a card (TabKept's `away`): a card's content is
            drawn in it (SheetCard, the Brief, Settings) and opens while it
            is in sight (lib/shown). */}
        <TabKept away={false}>{body}</TabKept>
      </div>
    </div>
  );

  // The route's figures pinned at the sheet's foot. Paged, FPL's own, at
  // its page's foot, put away with it while Search is up.
  const foot = !!p.foot && (footShown || cardsUp) && (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions -- a pointer convenience, not a control: the grabber is the keyboard's way to open the sheet, and the figures' own buttons stay focusable
    <div
      data-testid="panel-foot"
      className={cn(
        // One box at the pill and all the way up, the figures centred
        // in it at their large size; at half small, the box only as tall
        // as they are (the owner, 2026-11-05). What gives way in the
        // pill (data-pill-hides) is put away there.
        "relative z-10 flex shrink-0 flex-col justify-center border-t print:hidden",
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
    </div>
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
              {barRowOf(bar, planShown, false)}
              {headBlock(routeShown, false)}
            </>,
            second,
            routeAlone,
            at !== 1,
            "0px",
            footShown,
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
