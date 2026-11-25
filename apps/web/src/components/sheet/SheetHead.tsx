import type { ReactNode } from "react";
import { cn } from "cn";
import { PanelSize } from "../../lib/mapChrome";
import { RISEN_FACE } from "./insets";
import { FULL_BAND, ROW_PAD, SHEET_BELOW, type PanelSizeValue, type SheetLayout, type SheetSlots } from "./sheetLayout";

/** The route's box under FPL's chips: the gap between groups (space.group,
 *  16; the owner, 2026-11-23), less what the bar's row already leaves under
 *  its chips (--chips-foot, index.css), so the pill's 68 is the same. */
const BELOW_CHIPS = "pt-[calc(var(--space-group)-var(--chips-foot))]";

/** The one search's row, its field (OneSearchField, SHEET_BAR: FPL's
 *  title line over its pills, 49 at the default size) sixteen in from
 *  either side as everything in the sheet is (the sheet audit's F-P1,
 *  F-P2, 2026-11-10): on a bottom sheet under the grabber's 16-point room
 *  (SheetGrabber, the least iOS keeps: the owner, 2026-11-13) and what is
 *  left of the 68 under it, 3; else ten over it and the rest under, 9
 *  (BAR_HEIGHT). The field grew 3 when FPL's title took its 25-point
 *  line (the HIG review, 2026-11-21), taken from the row's foot so the
 *  pill, this row alone, keeps its 68 (sheet/insets' 4.25 rem). The pill
 *  is this row alone: the title row over it went for the map's room (the
 *  owner, 2026-11-10). */
function barRowPad(underGrabber: boolean) {
  if (underGrabber) return "h-[4.25rem] pt-4 pb-(--chips-foot)";
  return cn("h-[4.25rem] pb-[max(0px,calc(2.125rem-var(--lead-heading)))]", ROW_PAD);
}
/** That row's height either way, for what pins under it (--sheet-head). */
export const BAR_HEIGHT = "4.25rem";

/**
 * A page's first row: the one search on Search, FPL's bar on FPL (its
 * twin, FplBar), one size on both, so a turn of the page moves nothing
 * and the map's room stays as it was (the owner, 2026-11-14).
 * `rises`: out of sight at the pill but laid out, coming into sight as a
 * finger takes the sheet (RISEN_FACE), where it is not the pill's own.
 */
export function SheetBarRow(p: {
  bar: ReactNode;
  shown: boolean;
  hairline: boolean;
  rises?: boolean;
  /** Pinned over a band that always scrolls (FPL's, SheetScroller's
   *  bandScrolls). */
  pinned?: boolean;
  layout: SheetLayout;
  panelSize: PanelSizeValue;
}) {
  const { layout } = p;
  return (
    <div
      className={cn(
        "flex shrink-0 px-4",
        barRowPad(layout.fromBottom),
        !p.shown && (p.rises ? RISEN_FACE : "hidden"),
        // All the way up on a phone the search alone is pinned at the
        // top, a hairline under it, as Apple Maps' is.
        p.hairline && layout.onPhone && layout.size === "full" && "border-b border-border",
        // Stuck in a band too tall to stick (bandFits), and in FPL's, which
        // always scrolls (bandScrolls), as iOS keeps a sheet's header
        // (FPL's went off the top, 2026-11-21): frosted where the body
        // scrolls under it, a phone's settled all the way up (FULL_BAND),
        // solid where it does not or the sheet moves, as the band was.
        "in-data-band-tall:sticky in-data-band-tall:top-0 in-data-band-tall:z-20",
        !p.pinned || !layout.onPhone ? "in-data-band-tall:frost-head" : layout.size === "full" ? FULL_BAND : "bg-(--sheet)",
      )}
    >
      <PanelSize.Provider value={p.panelSize}>{p.bar}</PanelSize.Provider>
    </div>
  );
}

/**
 * The route's row (or a workspace's head) and the controls under it: under
 * the search, or paged under FPL's bar.
 */
export function SheetHeadBlock(p: { shownAtRest: boolean; alone: boolean; rises?: boolean; slots: SheetSlots; layout: SheetLayout }) {
  const { slots, layout } = p;
  const { atPill } = layout;
  // Drawn at the pill too where it rises with the sheet, as at half.
  const risen = !!p.rises && !p.shownAtRest;
  const shown = p.shownAtRest || risen;
  const content = risen ? slots.top : atPill ? slots.compact : slots.top;
  const keptHere = slots.kept != null && shown && content === slots.kept;
  return (
    <div
      className={cn(
        "relative flex flex-col",
        slots.bar && layout.barShown && (!atPill || risen) && SHEET_BELOW,
        ((!shown && slots.kept == null) || p.alone) && "hidden",
        risen && RISEN_FACE,
      )}
    >
      {(shown || slots.kept != null) && (
        <header
          className={
            !shown
              ? "contents"
              : cn(
                  "@container flex items-center gap-2 print:hidden",
                  atPill && !risen
                    ? cn("px-2.25 pb-3", ROW_PAD)
                    : slots.top == null
                      ? undefined
                      : cn("px-3 pb-2", layout.barShown ? BELOW_CHIPS : ROW_PAD),
                )
          }
        >
          {/* The kept row first, in the one place whatever is shown, so
              it is never built again; out of sight inert and not laid
              out (tab-away). */}
          {slots.kept != null && (
            <div className={keptHere ? "contents" : "tab-away pointer-events-none absolute"} inert={!keptHere}>
              {slots.kept}
            </div>
          )}
          {shown && !keptHere && content}
        </header>
      )}
      {shown && (!atPill || risen) && slots.controls && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 px-3 pt-1 pb-1.5 print:hidden">{slots.controls}</div>
      )}
    </div>
  );
}
