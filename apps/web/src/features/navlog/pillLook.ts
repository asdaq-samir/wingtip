import { cn } from "cn";
import { TEXT } from "../../lib/text";

/**
 * FPL's airplane and altitude pills (FlightInputs, AltitudeGroup): each the
 * stock ComboboxInput (ui/combobox, shadcn's on Base UI's Combobox) with
 * its group put to the pill the owner picked -- 28 tall, the route box's
 * fill, round -- and its words the row's, never larger than at the owner's
 * 17.88 px text (19 px), where at 19.65 the row's buttons wrapped onto a
 * line of their own (the FPL audit's A3; the owner's route-box-buttons
 * rule, 2026-10-24). The airplane's gives way first in a row too narrow
 * for everything; the altitude's (shrink-0) keeps its figures (the owner's
 * list, 2026-11-17).
 */
export const PILL = cn(
  "h-7 items-center rounded-full border-0 bg-foreground/8 shadow-none dark:bg-foreground/8",
  TEXT.row,
  "pointer-coarse:text-[length:min(1.0625rem,19px)]",
);

/**
 * The pill's field: one width whatever is in it, the widest value it takes
 * (each caller's, in ch; the owner's "Keep these inputs fixed size"), giving
 * way only in a row too narrow for everything, its words the pill's size and
 * never under the stock input's 16 (under 16 iOS zooms the page in on a
 * field), and 44 tall over the 28 pill, so a tap a little above or below
 * the words is still the field's (index.css's 44-point rule), nothing
 * grown that is seen.
 */
export const PILL_FIELD = cn(
  "relative z-10 -my-2 h-11 min-w-0 flex-initial py-0 pr-0.5 pl-2.5 font-semibold placeholder:font-normal placeholder:text-foreground/70",
  "text-[length:inherit] md:text-[length:inherit] pointer-coarse:text-[length:inherit]",
);
