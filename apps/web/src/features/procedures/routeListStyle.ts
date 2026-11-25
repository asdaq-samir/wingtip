import { cn } from "cn";
import { CAPSULE_HIT, GLASS_PICKED } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";

// The classes and styles FPL's route list (ProceduresRoute) and its parts
// share: its cards (routeCard), its rows (procedures/RouteRows,
// FieldStep) and its chips (procedures/PatternChips, ProcedureSheet).

/** The line that joins the route's points down FPL's list, in the course's
 *  magenta as the map draws the route, at the owner's ask ("draw the
 *  connection with magenta line"); it was the border's grey. The token
 *  (index.css --course, lib/tokens' CHART.course) rather than the
 *  value, so the Chart ink look's own magenta reaches it. */
export const ROUTE_LINE = { backgroundColor: "var(--course)" } as const;

/** The one card look of FPL's list: the Nav Log's picked row's fill and
 *  corner (NavLogList), with no border or shadow (the owner, 2026-11-17:
 *  "Why don't we show airport card color when tapped in fpl like Navlog
 *  does ... show it all the time, tapping just makes it bigger"). Every
 *  airport is one; its runways and procedures open inside it. */
const POINT_FILL = "rounded-xl bg-foreground/8";
/** An airport's card in the route's list, whose waypoints are plain rows
 *  between: drawn out past the column by its own padding, as the Nav
 *  Log's picked row is, so its mark stays on the course's line. */
export const FIELD_CARD = cn(POINT_FILL, "-mx-1.5 px-1.5 py-2");
/** The room under an airport's card. */
export const FIELD_GAP = "mb-3";

/** A chip of the procedures' choices (Chips), on the stock ToggleGroupItem
 *  in its glass variant (`variant="glass"`): a capsule 32 high, the one
 *  picked filled (GLASS_PICKED), its 44-point hit area a pseudo-element
 *  six round it. */
export const CHIP = cn(CAPSULE_HIT, "h-8 min-w-11 justify-center px-3 font-normal", GLASS_PICKED, TEXT.detail);

/** The slim pill of a field's Landing and Takeoff on FPL's list (the owner,
 *  2026-11-25: "Old pills style should be replaced with the slimmer route
 *  box pill style"): the route box's N-number and altitude pills'
 *  (navlog/pillLook's PILL) 24 tall, its fill and round ends, its words
 *  the row's at 16 on a phone, black, as theirs are; 10 above and below
 *  make its 44 (index.css's hit-y), nothing grown that is seen. */
export const SLIM_PILL = cn(
  "relative h-6 shrink-0 gap-1 rounded-full bg-foreground/8 px-2.5 font-normal text-foreground hit-y-2.5 dark:bg-foreground/8",
  TEXT.row,
  "pointer-coarse:text-[length:1rem]",
);

/** A procedure picked, its pill as wide as the card (the owner,
 *  2026-11-25: "if a procedure is selected then it becomes a card width
 *  pill that can be expanded to show the fixes"): 36 tall, round, a
 *  hairline and no fill, so the airports' rows lead the list and not the
 *  procedures (2026-11-25, "Fix them"). */
export const WIDE_PILL = "flex h-9 min-w-0 flex-1 items-center rounded-full ring-1 ring-foreground/12 ring-inset";
