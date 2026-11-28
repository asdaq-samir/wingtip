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
 *  2026-11-25: "the slimmer route box pill style"): the route box's pills'
 *  (navlog/pillLook's PILL) fill and round ends, at least 24 tall and
 *  growing with larger text so its words keep a little room above and
 *  below, its words the row's at 16 on a phone. Its area reaches 44 each
 *  way (index.css's hit-y; and wide, as Explain's, where "RWY" has gone
 *  and the pill is only a number), nothing grown that is seen. */
export const SLIM_PILL = cn(
  "relative min-h-6 shrink-0 gap-0.5 rounded-full bg-foreground/8 px-2 py-0.5 font-normal text-foreground hit-y-2.5 [--hit-x:min(0px,calc((100%_-_44px)/2))] dark:bg-foreground/8",
  TEXT.pill,
);

/** A procedure picked, its pill as wide as the card (the owner,
 *  2026-11-25: "if a procedure is selected then it becomes a card width
 *  pill that can be expanded to show the fixes"): 36 tall, round, a
 *  hairline and no fill, so the airports' rows lead the list and not the
 *  procedures (2026-11-25, "Fix them"). */
export const WIDE_PILL = "flex h-9 min-w-0 flex-1 items-center gap-1 rounded-full pr-1.5 ring-1 ring-foreground/12 ring-inset";
