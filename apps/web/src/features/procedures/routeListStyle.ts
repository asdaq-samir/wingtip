import { cn } from "cn";
import { CAPSULE_HIT, GLASS_PICKED } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";

// The classes and styles FPL's route list (ProceduresRoute) and its parts
// share: its cards (routeCard, RouteEnds), its rows (procedures/RouteRows,
// FieldStep) and its chips (procedures/PatternChips, ProcedureSheet).

/** The line that joins the route's points down FPL's list, in the course's
 *  magenta as the map draws the route, at the owner's ask ("draw the
 *  connection with magenta line"); it was the border's grey. The token
 *  (index.css --course, chartColors' COURSE_MAGENTA) rather than the
 *  value, so the Chart ink look's own magenta reaches it. */
export const ROUTE_LINE = { backgroundColor: "var(--course)" } as const;

/** The one card look of FPL's list: the Nav Log's picked row's fill and
 *  corner (NavLogList), with no border or shadow (the owner, 2026-11-17:
 *  "Why don't we show airport card color when tapped in fpl like Navlog
 *  does ... show it all the time, tapping just makes it bigger"). Every
 *  airport is one, in every layout; its runways and procedures open
 *  inside it. */
const POINT_FILL = "rounded-xl bg-foreground/8";
/** A point's card where the list is cards (RouteListEdit's `cards`, the
 *  Plan): every point one, room inside it for its mark's column. */
export const POINT_CARD = cn(POINT_FILL, "py-3 pr-1.5 pl-3");
/** An airport's card in the box's and the line's lists, whose waypoints are
 *  plain rows between: drawn out past the column by its own padding, as
 *  the Nav Log's picked row is, so its mark stays on the course's line. */
export const FIELD_CARD = cn(POINT_FILL, "-mx-1.5 px-1.5 py-2");
/** The room between a card and the next, the course's line across it. */
export const CARD_GAP = "mb-5.5";
/** The room under an airport's card in the box's and the line's lists. */
export const FIELD_GAP = "mb-3";

/** A card's runways and procedures, started 20 in, 5 clear of the line
 *  down the marks' column (CardThread), not under the ident's 38 as the
 *  list's are: the room the capsules and pull-downs gain. */
export const CARD_BODY = "pl-5";

/** A chip of the procedures' choices (Chips), on the stock ToggleGroupItem
 *  in its glass variant (`variant="glass"`): a capsule 32 high, the one
 *  picked filled (GLASS_PICKED), its 44-point hit area a pseudo-element
 *  six round it. */
export const CHIP = cn(CAPSULE_HIT, "h-8 min-w-11 justify-center px-3 font-normal", GLASS_PICKED, TEXT.detail);
