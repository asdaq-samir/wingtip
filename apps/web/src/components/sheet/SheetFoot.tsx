import { useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "cn";
import { EDGE_ROOM } from "./insets";
import { PointerTapDiv } from "./PointerTapDiv";
import { FOOT_BAR_PILL, FootRestOf } from "./FootBar";
import { CONTROLS_TAPPABLE, ROW_PAD, SHEET_BELOW, type SheetLayout } from "./sheetLayout";
import { UNDER_INDICATOR } from "./SheetDrawer";
import { useTellFootBar } from "./footBarHeight";
import { useGroundTaps } from "./groundTaps";

/** Beside the side panel the room under its foot is the panel's own
 *  padding (MapPanel's pb-4, a rem), not a bottom sheet's EDGE_ROOM, from
 *  which a floating bar's margin is reckoned (FplTabBar). That rem is the
 *  grabber's (SheetGrabber's 16-point box at the panel's foot), so the bar
 *  keeps out of it, its foot 4 points over the grabber's box, as the
 *  airport card's does (CardTabBar's GRABBER_ROOM; tab-consistency.spec):
 *  given back, the bar lay over the grabber, its pill on "Nav Log" and
 *  "Routes" (the HIG audit of 2026-11-23, M3). */
const SIDE_FLOAT_ROOM = EDGE_ROOM;

/**
 * The sheet's foot, the route's figures pinned at it -- in the pill its one
 * row; FPL's at its page's, put away with it under Search. On a phone's
 * bottom sheet FPL's foot on the ground is a bar beside the sheet instead
 * (sheet/FootBar); here it is the side panel's foot, a top sheet's, and
 * on a phone's bottom sheet in flight and in a dry run, beside the sheet
 * as FPL's bar is (`layout.footBar`, BesideSheet). What it holds is told
 * the size the sheet rests at (FootRestOf), as the bar's is.
 */
export function SheetFoot(p: {
  foot: ReactNode;
  /** The pill is this foot's row (a bar or a capsule's own row at the pill). */
  pillFoot: boolean;
  /** A floating bar in it (FPL's actions' glass bar, SheetPages' floats). */
  floats: boolean;
  layout: SheetLayout;
  onFootTap: () => void;
}) {
  const { pillFoot, floats } = p;
  const { size, fromBottom, footShown, onPhone, flying } = p.layout;
  // The route's figures the pill's one row on a phone's bottom sheet.
  const figuresPill = pillFoot && footShown && onPhone && fromBottom && !flying;
  const foot = (
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
        // The figures as the pill's one row (FPL's, not flying): under
        // the grabber's 1 rem room, the rest of the pill's 4.25 rem
        // (sheet/insets) less the foot's edge room, the figures' 2.6875
        // rem (a name's 18-point line over a value's 25) centred in it.
        figuresPill
          ? "pt-0 pb-0"
          : cn(
              // A floating bar in it (FPL's actions) keeps its own room
              // under it (FplTabBar, floatingBarLook's FLOATING_BAR_SHEET_ROOM).
              // Beside the side panel too, off the pill, its room the
              // panel's own (SIDE_FLOAT_ROOM).
              floats && (fromBottom || !pillFoot) ? "pb-0" : fromBottom || size !== "half" ? "pb-1" : "pb-4",
              size === "half" ? "min-h-0" : "min-h-[3.875rem]",
              ROW_PAD,
            ),
        p.layout.layer === "card" ? "px-0" : "px-4",
        !footShown && "hidden",
        pillFoot ? "border-transparent [&_[data-pill-hides]]:hidden [&>*]:flex-none" : cn("border-border/60", SHEET_BELOW),
        // No hairline over a bar that floats (FPL's actions' glass bar on
        // the ground), as none is over a card's tabs (the owner, 2026-11-16:
        // "Why do I see a separator above the tabs bar?").
        floats && "border-transparent",
      )}
      style={
        {
          "--sheet-progress": size === "half" && !p.layout.desktop ? "0" : "1",
          ...(p.layout.toEdge && fromBottom && !pillFoot ? { paddingBottom: "10px" } : {}),
          ...(figuresPill ? { height: `calc(${FOOT_BAR_PILL} - ${EDGE_ROOM})` } : {}),
          ...(floats && !fromBottom && !pillFoot ? { marginBottom: SIDE_FLOAT_ROOM } : {}),
        } as CSSProperties
      }
      // In the pill a tap on it opens it half way.
      onClick={pillFoot ? p.onFootTap : undefined}
    >
      <FootRestOf size={size}>{p.foot}</FootRestOf>
    </PointerTapDiv>
  );
  return p.layout.footBar ? (
    <BesideSheet shown={footShown} pill={pillFoot} toEdge={p.layout.toEdge} onTap={p.onFootTap}>
      {foot}
    </BesideSheet>
  ) : (
    foot
  );
}

/**
 * The foot on a phone's bottom sheet in flight and in a dry run: like
 * FPL's bar on the ground (sheet/FootBar), still over the screen's foot
 * beside the Drawer's popup, in its viewport (SheetDrawer's `foot`), so the
 * sheet slides behind it and nothing in it follows the sheet (the
 * sheet-motion audit of 2026-11-23: anything that stays still at the foot
 * lives outside the sliding panel). It stood in the popup, moved back by
 * the Drawer's offset and the finger's movement on the Drawer's curve,
 * with the body cut where it began, and could slide apart from the sheet
 * on the iPhone mid-drag.
 *
 * On the sheet's own ground, carried on under the home indicator, so
 * nothing slid behind it shows there. Its ground takes no touch, only its
 * controls do: a drag on it is the sheet's under it. At the pill, whose
 * row it is, a tap on it raises the sheet to half, as it did in the
 * popup; from half up a tap on its ground goes no further (useGroundTaps).
 * Its height is the page's end room (useFootBarHeight, SheetScroller), so
 * the last row scrolls clear above it. Out of sight at once under a card.
 */
function BesideSheet(p: { shown: boolean; pill: boolean; toEdge: boolean; onTap: () => void; children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  useTellFootBar(bar);
  useGroundTaps(bar, p.shown, p.pill ? p.onTap : undefined);
  return (
    <div
      ref={bar}
      data-foot-bar=""
      inert={!p.shown}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-(--sheet) text-foreground print:hidden",
        UNDER_INDICATOR,
        CONTROLS_TAPPABLE,
        !p.shown && "invisible",
      )}
      // A bottom sheet's eight points under it where there is no home
      // indicator, as in the sheet (SheetParts' spacer), none where its
      // body runs to the edge.
      style={{ paddingBottom: p.toEdge ? undefined : EDGE_ROOM }}
    >
      {p.children}
    </div>
  );
}
