import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";
import { EDGE_ROOM, HOLD_AT_EDGE } from "./insets";
import { PointerTapDiv } from "./PointerTapDiv";
import { ROW_PAD, SHEET_BELOW, type SheetLayout } from "./sheetLayout";

/** A bottom sheet's pill under its grabber's 1 rem room: the 4.25 rem
 *  snap point's rest (sheet/insets), where the figures sit at the pill. */
const PILL_BELOW_GRABBER = "3.25rem";

/** Beside the side panel the room under its foot is the panel's own
 *  padding (MapPanel's pb-4, a rem), not a bottom sheet's EDGE_ROOM, from
 *  which a floating bar's margin is reckoned (FplTabBar): the foot gives
 *  the difference back, so FPL's bar sits 4 points over the panel's foot
 *  as the airport card's does at every text size (tab-consistency.spec),
 *  where it stood 24 higher. */
const SIDE_FLOAT_ROOM = `calc(${EDGE_ROOM} - 1rem)`;

/**
 * The sheet's foot, the route's figures pinned at it -- in the pill its one
 * row; FPL's at its page's, put away with it under Search, over the page's
 * end (pinAtFoot's --pin-foot-room).
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
  // On a phone, what stays in sight at the sheet's free edge while the
  // popup, laid out at its full height, slides: moved back by the Drawer's
  // own offset and the finger's (its CSS variables), on its curve, and the
  // body cut off where those parts begin: the sheet's figures.
  const follows = onPhone ? HOLD_AT_EDGE : undefined;
  return (
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
        // "Why do I see a separator above the tabs bar?"); off the pill taps go through it to the figures under it but the bar's.
        floats && cn("border-transparent", !pillFoot && "pointer-events-none"),
        // Under the floating bar, iOS 26's soft scroll edge: what scrolls
        // under it fades towards the sheet's own colour, from a little over
        // the bar's top to most of the way solid at its foot, so the route
        // still shows through the glass but its words never run into the
        // bar's (the HIG review, 2026-11-21: "Brief Land RWY Nav Log ≋18
        // More" at half; the owner took the fade under the bar only, not
        // the solid band of the UI audit's B1). Drawn behind the bar, in
        // the foot's own layer; no fade at the pill, where the bar is out
        // of sight.
        floats &&
          !pillFoot &&
          "before:pointer-events-none before:absolute before:inset-x-0 before:-top-4 before:bottom-0 before:-z-10 before:bg-linear-to-b before:from-transparent before:to-(--sheet)/85 before:to-60% before:content-['']",
      )}
      style={
        {
          "--sheet-progress": size === "half" && !p.layout.desktop ? "0" : "1",
          marginTop: "calc(-1 * var(--pin-foot-room, 0px))",
          ...(p.layout.toEdge && fromBottom && !pillFoot ? { paddingBottom: "10px" } : {}),
          ...(figuresPill ? { height: `calc(${PILL_BELOW_GRABBER} - ${EDGE_ROOM})` } : {}),
          ...(floats && !fromBottom && !pillFoot ? { marginBottom: SIDE_FLOAT_ROOM } : {}),
        } as CSSProperties
      }
      // In the pill a tap on it opens it half way.
      onClick={pillFoot ? p.onFootTap : undefined}
    >
      {p.foot}
    </PointerTapDiv>
  );
}
