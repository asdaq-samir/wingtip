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
 *  glyph out past the pill's end and over the next pill. The field's 44
 *  band over it, as over "FL-" (a tap there focuses the field, the stock
 *  addon's own click), over the head under it (z-10) and under the glyph
 *  (z-20), the addon itself no layer of its own, so the glyph's area still
 *  reaches over the next pill's empty start: with no plan yet the Profile's glyph
 *  is greyed and takes no tap, and a tap just past the figures above or
 *  below the pill went to the head round it (the iOS audit's P1,
 *  "altitude-input" 31×44 on FPL with no route). */
export const PILL_END_ADDON = cn(
  "relative py-0 pr-0 has-[>button]:mr-0",
  "after:absolute after:inset-x-0 after:top-1/2 after:z-10 after:h-11 after:-translate-y-1/2 after:content-['']",
);

/**
 * A pill's glyph at its end, the stock InputGroupButton in the tint: the
 * N-number's ⓘ (the airplane's card) and the altitude's Profile (the owner,
 * 2026-11-20: "can N number show an info button and can FL show profile
 * button rather than in the tab bar?"). The app's one icon button, 36 round
 * a 20 glyph (the iOS audit's P18, the owner's "make all buttons same size
 * as Apple Maps", 2026-11-20), where it was 20 by 24 round a 16: its box
 * seen by nothing (no fill, no edge, its corner under half its side so it
 * is not the round 44), and laid in the pill's 20 by 24 alone (-mx-2,
 * -my-1.5), so both pills still fit the head at the owner's 19.65 px text.
 * The box reaches 8 into the field before it, the field's own empty end
 * (its 5ch and 0.5rem, the words at most 5ch), never over its words, and 8
 * past the pill's end; its area (index.css's rule, a pseudo-element) 4 more
 * past that and 4 over and under, 44 tall and 12 past the pill in all,
 * over the 4 to the next pill and that pill's own empty 8 before its "FL-".
 */
export const PILL_END = cn(
  "relative z-20 -mx-2 -my-1.5 size-9 rounded-md border-0 hover:bg-transparent hover:text-tint aria-expanded:bg-transparent [&_svg]:size-5!",
  "hit-y-1 after:left-0 after:-right-1",
);
