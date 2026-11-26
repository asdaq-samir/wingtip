import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";
import TabKept from "../TabKept";
import { AT_PILL, PILL_BODY, SHEET_SLIDE } from "./insets";
import { SWIPE_READER } from "./sheetFollow";
import { PointerTapDiv } from "./PointerTapDiv";
import { bandFits } from "./bandFits";
import { CONTROLS_UNTAPPED, FULL_BAND, SHEET_BELOW, tapOpens, type SheetLayout } from "./sheetLayout";
import { useFootBarHeight } from "./sheetMotion";

/** The head band's ground where nothing scrolls under it: a phone's sheet
 *  at the pill and half, whose body does not scroll (index.css's one
 *  scrolling rule), so the frost would blur the sheet's own flat colour
 *  into the same colour. Solid there, not frosted: iPhone Safari redrew a
 *  backdrop-filter under the route's card every frame the sheet slid, and
 *  a slow drag up from half drew the card in fine horizontal stripes, its
 *  idents smeared (the owner's iPhone, 2026-11-17). Frosted all the way
 *  up, where the body scrolls on under it. */
const SOLID_BAND = "bg-(--sheet)";
/** A band risen with the sheet from the pill: on its ground, and over the body, as at half. */
const RISEN_BAND =
  "group-data-swiping/sheet:bg-(--sheet) group-data-risen/sheet:bg-(--sheet) group-data-swiping/sheet:z-20 group-data-risen/sheet:z-20";

/** The body cut off at a bottom sheet's figures by the same offset, the
 *  finger's movement handed to it alone (SWIPE_READER, sheet/sheetFollow).
 *  Eased with the sheet once it is drawn where it rests (its popup's
 *  data-ready): the cut is the sheet's slide itself, a straight line of
 *  it, so on the same curve and time it is where the sheet is at every
 *  frame, where it jumped to its end at the let-go and showed a band of
 *  bare sheet under the route through the settle (the gestures audit of
 *  2026-11-23, M1). The scroller is a composited layer of its own
 *  (will-change: transform, with no transform set, so nothing moves and no
 *  fixed part is held to it; none is), so each frame of the eased cut
 *  changes only the clip the compositor applies to the layer's pixels,
 *  where it repainted the whole scroller every frame of a settle (the
 *  motion audit of 2026-11-23, fpl-motion, low). */
const CUT_BOTTOM = `[will-change:transform] [clip-path:inset(0_0_max(0px,calc(var(--sheet-offset,0px)+var(--sheet-swipe,0px)))_0)] group-data-ready/sheet:transition-[clip-path] duration-(--motion-drawer) ease-(--motion-drawer-ease) group-data-swiping/sheet:transition-none ${SWIPE_READER} ${SHEET_SLIDE}`;

/** Where the panel's top-right button sits, one place in every panel. */
const CORNER_VARS = {
  "--corner-line": "calc((2.875rem - 36px) / 2)",
  "--corner-inset": "calc(0.25rem + (2.875rem - 36px) / 2)",
} as CSSProperties;

interface ScrollerProps {
  band: ReactNode;
  body: ReactNode;
  /** A card or a page at the pill, with no search and no pill of its own
   *  over it: its one title row (PinnedHead, data-sheet-head) shown in the
   *  pill's room, the rest of it out of sight, a tap on the row raising it
   *  back to half, as Apple Maps' place card at its smallest (the owner,
   *  2026-11-11: Settings dragged to the smallest size left the sheet empty). */
  alone: boolean;
  /** A page out of sight beside the one up, its body inert. */
  off: boolean;
  /** --sheet-head: what a list's pinned head sticks under. */
  head: string;
  /** The figures pinned at its foot, so its body is cut off there. */
  cut: boolean;
  /** FPL's page: under its foot bar (sheet/FootBar, "bar") room at its
   *  end as tall as the bar, so its last row scrolls clear above it. With
   *  none its foot (SheetFoot) ends the page, clear of the home indicator. */
  endRoom?: "bar";
  /** Its band risen with the sheet from the pill (FPL's), frosted as at half from the finger's first move. */
  rises?: boolean;
  /** Its band always scrolls with the body, its title row alone pinned
   *  (SheetHead's in-data-band-tall): FPL's, whose band holds the whole
   *  route. Left to bandFits, the band went from sticky to scrolling and
   *  back each time the route's height crossed the scroller's -- a card
   *  folding open, a line opening, the end room coming and going -- and
   *  the list jumped by the difference at every crossing, the sheet seen
   *  shaking as it scrolled and as cards opened (the owner's iPhone,
   *  2026-11-25: "The fpl sheet is shaking when scrolling and opening
   *  cards"). */
  bandScrolls?: boolean;
  layout: SheetLayout;
  onFootTap: () => void;
}

/** One scroller: its head's band sticky at its top and the body under it. */
export function SheetScroller(p: ScrollerProps) {
  const { atPill, onPhone, fromBottom, size, cardsUp } = p.layout;
  // The foot bar's height on these two elements alone: set on an ancestor
  // as an inherited variable it restyled the whole sheet at every change.
  const barPx = useFootBarHeight((s) => s.height);
  return (
    <div
      data-sheet-scroll=""
      // Where a list's pinned head sticks under the head band (PinnedHead):
      // the search's row, a fixed height, where that is all the band holds
      // (a tab's lists); none over a card, which has the sheet to itself.
      // A row focused or brought into view stops under the search's row,
      // not behind it (WCAG 2.4.11); one tabbed to at the foot stops over
      // the foot bar, not under it, where the page has its end
      // room for it (the r6 UI audit's M5).
      style={
        { "--sheet-head": p.head, scrollPaddingTop: p.head, scrollPaddingBottom: p.endRoom === "bar" ? barPx : undefined } as CSSProperties
      }
      // Its scroll stops at its own end, not chained on to the drawer or the
      // page, so the head stays put as the rows stop (the owner,
      // 2026-11-22: "When I scroll up on the plan, it keeps scrolling up
      // and the title disappears"), as Apple Maps' card does.
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain print:overflow-visible",
        onPhone && fromBottom && p.cut && CUT_BOTTOM,
      )}
    >
      <PointerTapDiv
        data-head-band=""
        // In the flow while taller than the scroller (bandFits), where
        // sticking it hid the body; FPL's always (bandScrolls).
        ref={p.bandScrolls ? undefined : bandFits}
        data-band-tall={p.bandScrolls ? "" : undefined}
        style={CORNER_VARS}
        // Risen from a pill that is a row of it (FPL's figures, held at the
        // foot), a tap on that row raises the sheet to half, as on the foot.
        onClick={p.rises ? (event) => tapOpens(event, p.onFootTap) : undefined}
        // Sticky at the scroller's top, frosted wherever the body runs on
        // up under it, the grabber's room inside it (the owner's iPhone,
        // 2026-11-11: clear, the list showed through the band); on a
        // phone only settled all the way up, solid below (SOLID_BAND) and
        // while it moves (FULL_BAND).
        className={cn(
          "sticky top-0 flex shrink-0 flex-col data-band-tall:static",
          // Scrolling with the body (bandScrolls), no frost of its own: its
          // pinned title row has it (SheetHead), not a backdrop-filter the
          // route's whole height for Safari to redraw as it scrolls.
          !atPill
            ? cn("z-20", p.bandScrolls ? undefined : !onPhone ? "frost-head" : size !== "full" ? SOLID_BAND : FULL_BAND)
            : // At the pill no control of the band's row takes a tap: a press
              // marks the sheet as dragged (Base UI's data-swiping) before
              // any move, which brings the row into sight under the finger,
              // and the tap landed on the N-number's field (the owner's
              // iPhone, 2026-11-26). The tap is the band's, which raises it.
              p.rises && cn(RISEN_BAND, CONTROLS_UNTAPPED),
        )}
      >
        {p.band}
      </PointerTapDiv>
      <PointerTapDiv
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          size !== "peek" && !fromBottom && "pb-4",
          SHEET_BELOW,
          cardsUp ? "invisible" : atPill && (p.alone ? AT_PILL : PILL_BODY),
          !onPhone && size === "peek" && "hidden",
        )}
        inert={p.off || cardsUp || (atPill && !p.alone)}
        data-panel-body=""
        // On a phone, Drawer.Content's own mark: a mouse dragged across the
        // body selects its words rather than moving the sheet (a finger
        // still moves it, where the body's lists are not scrolling).
        data-drawer-content={onPhone ? "" : undefined}
        onClick={atPill && p.alone ? (event) => tapOpens(event, p.onFootTap) : undefined}
      >
        {/* Not put away under a card (TabKept's `away`): a card's content is
            drawn in it (SheetCard, the Brief, Settings) and opens while it
            is in sight (lib/shown). */}
        <TabKept away={false}>{p.body}</TabKept>
      </PointerTapDiv>
      {/* The page's end room under FPL's foot bar, which stands over the
          sheet's foot outside it (sheet/FootBar): the bar's height
          (useFootBarHeight), so the route's
          last row scrolls up clear of the figures and the tabs all the way
          up, as a list ends clear of iOS's tab bar; and the gap between
          groups (space.group) over it, less what the route's box keeps
          under its last row (--box-foot, index.css). */}
      {p.endRoom === "bar" && (
        <div
          aria-hidden="true"
          className="shrink-0"
          style={{ height: `calc(${barPx}px + var(--space-group) - var(--box-foot))` }}
          data-foot-room=""
        />
      )}
    </div>
  );
}
