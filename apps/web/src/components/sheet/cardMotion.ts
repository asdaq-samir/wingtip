import { cn } from "cn";
import { SHEET_SLIDE } from "./insets";

/** How a card is put away: on a page's time (motion.page), shorter than
 *  its coming, as a system answers faster than the pilot decides (the
 *  feel audit, 2026-11-27, the owner taking it). Base UI's own ending
 *  style, its time alone changed: the Drawer waits on the popup's own
 *  transition, so nothing mirrors it. SheetDrawer's GIVE_WAY brings the
 *  sheet back on the same time. */
const AWAY = "data-ending-style:duration-(--motion-page)";

/** A card's drag eased on the Drawer's own curve, never under a finger;
 *  its fade as it is put away the same, on AWAY's time. */
export const EASE = `transition-[transform,opacity] duration-(--motion-drawer) ease-(--motion-drawer-ease) ${AWAY} data-swiping:transition-none ${SHEET_SLIDE}`;

/**
 * A card comes up where the front sheet's top is -- the sheet's, or the
 * card's under it that the map's buttons ride -- and eases from there to
 * its own size, as Apple Maps' place card takes over its sheet at the
 * height the sheet is: its popup placed there while the Drawer marks it
 * starting (--card-from, the front's own snap offset as the card opened,
 * less the sheet's offset it is drawn in, --sheet-base, SheetDrawer). So
 * the map's buttons ride its top from its first frame and only glide if
 * its height changes (sheetTopSlot). It rose from the screen's foot once,
 * Base UI's Snap points demo's entry, and the buttons gave way while it
 * slid (the owner's iPhone, 2026-11-13: they "redraw" at every card).
 * Base UI writes --drawer-snap-point-offset as 0 until it has measured, so
 * with no starting place a new card was drawn all the way up and slid
 * down to half (the owner, 2026-11-11). Faded in as it comes, and put
 * away the way it came: back down to the top of the sheet in front of it
 * once it is gone (--card-to, set as it closes, sheetTopSlot's
 * frontUnder) and faded out, the sheet's content fading back in under it
 * (SheetDrawer's GIVE_WAY) -- only its face fades, the map's buttons
 * riding its top from the first frame as before (the apple-design audit
 * of 2026-11-23, M1: it came in with a cut and left with a fade in place).
 * Swiped away (a settings card at half), --card-to is the screen's foot,
 * so it carries on down from where the finger let it go, as the stock
 * PhoneSheet does, rather than going back up as it fades (the gestures
 * audit's M3; CardStack sets it).
 *
 * Base UI plays that entry only for a drawer that opens after it has
 * mounted; one mounted already open is drawn where it rests from its first
 * frame (its useTransitionStatus), which before it has measured itself is
 * all the way up. Every card opened anew -- a tap on the chart, a place, a
 * NOTAM -- mounted open, and came in at the top and dropped to half (the
 * owner's iPhone, 2026-11-12, TFR 6/2478; in WebKit at 390x844 its top at
 * 8 px in its first frame, then easing down to 476). So a card's drawer
 * opens the render after its size is set (CardDrawer's `open`), and is
 * never drawn anew after that (CardStack).
 */
export const RISE = cn(
  "data-starting-style:[transform:translateY(calc(var(--card-from,var(--sheet-base,0px))_-_var(--sheet-base,0px)))] data-starting-style:opacity-0",
  "data-ending-style:[transform:translateY(calc(var(--card-to,var(--sheet-base,0px))_-_var(--sheet-base,0px)))] data-ending-style:opacity-0",
);

/** From `md` up a card has no sizes to slide between: it comes in and goes
 *  with a fade and a short move from where it stands -- from the right
 *  edge in the inspector's column, up over the side panel -- on the
 *  Drawer's time, as Apple Maps' place card does on an iPad, where it was
 *  there and gone in one frame while the map eased to make room for it
 *  (the apple-design audit of 2026-11-23, H1). Opacity only under Reduce
 *  Motion. */
export const SIDE_EASE = `card-fade transition-[translate,opacity] duration-(--motion-drawer) ease-(--motion-drawer-ease) ${AWAY} data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:translate-none`;
export const FROM_EDGE = "data-starting-style:translate-x-4 data-ending-style:translate-x-4";
export const FROM_BELOW = "data-starting-style:translate-y-2 data-ending-style:translate-y-2";
