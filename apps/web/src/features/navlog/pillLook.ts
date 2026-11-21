import { cn } from "cn";
import { TEXT } from "../../lib/text";

/**
 * FPL's airplane and altitude pills (FlightInputs, AltitudeGroup): each the
 * stock ComboboxInput (ui/combobox, shadcn's on Base UI's Combobox) with
 * its group put to the pill the owner picked -- 24 tall (28 until the
 * owner's "Make the N and FL pills a bit smaller", 2026-11-20), the route box's
 * fill, round -- and its words the row's, never larger than at the owner's
 * 17.88 px text (19 px), where at 19.65 the row's buttons wrapped onto a
 * line of their own (the FPL audit's A3; the owner's route-box-buttons
 * rule, 2026-10-24). The airplane's gives way first in a row too narrow
 * for everything; the altitude's (shrink-0) keeps its figures (the owner's
 * list, 2026-11-17). Its words in the regular weight, a step under the
 * row's 17 on a phone: 16, the least an input takes before iOS zooms the
 * page in on it (the owner, 2026-11-20: "N and FL fonts can be non-bold
 * and smaller"), so the pills read as settings under the title, not as
 * headings of their own.
 */
export const PILL = cn(
  "h-6 items-center rounded-full border-0 bg-foreground/8 shadow-none dark:bg-foreground/8",
  TEXT.row,
  "pointer-coarse:text-[length:1rem]",
);

/**
 * The pill's field: one width whatever is in it, the widest value it takes
 * (each caller's, in ch; the owner's "Keep these inputs fixed size"), giving
 * way only in a row too narrow for everything, its words the pill's size and
 * never under the stock input's 16 (under 16 iOS zooms the page in on a
 * field), and 44 tall over the 24 pill, so a tap a little above or below
 * the words is still the field's (index.css's 44-point rule), nothing
 * grown that is seen. Its 2 at the end kept with a glyph after it (PILL_END),
 * where the input group's own end padding would narrow the fixed width.
 */
export const PILL_FIELD = cn(
  "relative z-10 -my-2.5 h-11 min-w-0 flex-initial py-0 pr-0.5! pl-2 font-normal placeholder:text-foreground/70",
  "text-[length:inherit] md:text-[length:inherit] pointer-coarse:text-[length:inherit]",
);

/**
 * A pill's fixed letters before what is typed -- the N of an N-number, the
 * FL of a flight level -- in the text's own colour, not the placeholder's
 * grey, so what is typed goes in after the dash (the owner, 2026-11-19:
 * "N and FL should be static letter and black, not grey, so input can be
 * entered after the dash"); the field after it with no padding of its own
 * (PREFIXED_FIELD), so nothing sets the figures apart from it.
 */
export const PILL_PREFIX = cn("pr-0 pl-2 font-normal text-foreground", "text-[length:inherit] pointer-coarse:text-[length:inherit]");
export const PREFIXED_FIELD = "pl-0!";

/** The end addon round a pill's glyph (PILL_END): none of the stock end
 *  addon's padding, nor its negative margin for a button, which drew the
 *  glyph out past the pill's end and over the next pill. */
export const PILL_END_ADDON = "py-0 pr-0 has-[>button]:mr-0";

/**
 * A pill's glyph at its end, the stock InputGroupButton in the tint: the
 * N-number's ⓘ (the airplane's card) and the altitude's Profile (the owner,
 * 2026-11-20: "can N number show an info button and can FL show profile
 * button rather than in the tab bar?"). 20 wide in the 24 pill round its
 * 16 glyph, so both pills still fit the head at the owner's 19.65 px text,
 * nothing grown that is seen and no edge of its own (the stock button's
 * clear one cut its area to 42); its area a pseudo-element (index.css's
 * rule): 44 tall, and out past the pill's end over the 4 points to the
 * next pill and that pill's own empty 8 before its "FL-", 32 wide in all,
 * never over the field before it, whose words stay the field's to tap.
 */
export const PILL_END = cn(
  "relative z-20 w-5 rounded-full border-0 hover:bg-transparent hover:text-tint aria-expanded:bg-transparent [&_svg]:size-4!",
  "after:absolute after:-inset-y-2.5 after:left-0 after:-right-3 after:content-['']",
);
