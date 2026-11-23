import type { ReactNode } from "react";
import { EDGE_ROOM } from "./insets";
import { SheetPage } from "./SheetPages";
import { BAR_HEIGHT, SheetBarRow, SheetHeadBlock } from "./SheetHead";
import { SheetScroller } from "./SheetScroller";
import { SheetFoot } from "./SheetFoot";
import type { PanelSizeValue, SheetLayout, SheetSlots } from "./sheetLayout";

export interface PartsProps {
  /** What it holds: its rows, body, foot and pages. */
  slots: SheetSlots;
  /** How it is laid out this render (MapPanel's sheetLayout). */
  layout: SheetLayout;
  panelSize: PanelSizeValue;
  onFootTap: () => void;
}

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
export function SheetParts({ slots, layout, panelSize, onFootTap }: PartsProps) {
  const { atPill, fromBottom, size, footShown, cardsUp, flying, barShown, onPhone } = layout;
  const { pages } = slots;
  const paged = !!pages;
  // Paged, the first page holds the search alone and the second its bar and
  // the route's row: no route row under the search.
  const headerShown = !paged && !flying && !cardsUp && (atPill ? !barShown : slots.top != null || !barShown);
  const headContent = atPill ? slots.compact : slots.top;
  const pillFoot = size === "peek" && !!(slots.bar || slots.compact);
  const bandOnly = !!slots.bar && barShown && !headerShown;
  const sheetHead = bandOnly ? BAR_HEIGHT : "0px";
  const parts = { layout, onFootTap };
  const barRow = slots.bar && <SheetBarRow bar={slots.bar} shown={barShown} hairline layout={layout} panelSize={panelSize} />;

  // FPL's foot on a phone's bottom sheet is a bar beside the sheet, not in it (sheet/FootBar).
  const foot = !!slots.foot && !layout.footBar && (footShown || cardsUp) && (
    <SheetFoot foot={slots.foot} pillFoot={pillFoot} floats={!!pages?.floats} {...parts} />
  );

  let content: ReactNode;
  if (pages) {
    const { at, bar, second } = pages;
    // The second page's first row, its bar (FplBar), and the route's row
    // under it from half up; at the pill the route's figures in the bar's
    // place where there are some (the foot, MapPanel's footShown), else the
    // bar, as Search's pill is its bar.
    const planShown = !flying && !cardsUp && (!atPill || !footShown);
    const routeShown = !flying && !cardsUp && !atPill && slots.top != null;
    const searchAlone = atPill && !flying && !barShown;
    const routeAlone = atPill && !flying && !planShown && !footShown;
    // At the pill whose face is the route's figures (the foot bar's,
    // sheet/FootBar), FPL's bar and route are laid out out of sight and
    // rise with the sheet (RISEN_FACE): the airport card's way, nothing
    // swapped as a finger takes it (the owner, 2026-11-16). On a phone only:
    // the side panel has no detents, so its pill is the foot's figures
    // alone, not 503 px mostly empty (the owner, 2026-11-19).
    const rises = onPhone && atPill && footShown && !flying && !cardsUp && slots.top != null;
    // One page up at a time (SheetPage), turned by its toggle (PageToggle);
    // the other kept, inert.
    content = (
      <div data-testid="sheet-pages" data-page={at} className="flex min-h-0 flex-1 flex-col print:block">
        <SheetPage at={0} up={at === 0}>
          <SheetScroller band={barRow} body={slots.children} alone={searchAlone} off={at !== 0} head={sheetHead} cut={false} {...parts} />
        </SheetPage>
        <SheetPage at={1} up={at === 1}>
          <SheetScroller
            band={
              <>
                <SheetBarRow bar={bar} shown={planShown} hairline={false} rises={rises} layout={layout} panelSize={panelSize} />
                <SheetHeadBlock shownAtRest={routeShown} alone={false} rises={rises} slots={slots} layout={layout} />
              </>
            }
            body={second}
            alone={routeAlone}
            off={at !== 1}
            head="0px"
            cut={footShown && !pages.floats}
            endRoom={layout.footBar}
            rises={rises}
            {...parts}
          />
          {foot}
        </SheetPage>
      </div>
    );
  } else {
    const headAlone = atPill && !flying && !barShown && !(headerShown && headContent != null);
    content = (
      <SheetScroller
        band={
          <>
            {barRow}
            <SheetHeadBlock shownAtRest={headerShown} alone={headAlone} slots={slots} layout={layout} />
          </>
        }
        body={slots.children}
        alone={headAlone}
        off={false}
        head={sheetHead}
        cut={footShown}
        {...parts}
      />
    );
  }

  return (
    <>
      {content}
      {!pages && foot}
      {/* A bottom sheet's eight points at its foot where there is no home
          indicator (in the body where it runs to the edge, toEdge); the
          indicator's own room is under the Drawer's viewport (SheetDrawer). */}
      {!layout.toEdge && onPhone && fromBottom && <div className="shrink-0" style={{ height: EDGE_ROOM }} aria-hidden="true" />}
    </>
  );
}
