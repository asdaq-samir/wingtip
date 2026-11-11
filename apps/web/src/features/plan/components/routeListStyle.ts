import { cn } from "cn";
import { GLASS_BUTTON, GLASS_PICKED } from "../../../lib/mapChrome";
import { TEXT } from "../../../lib/text";

// The classes and styles FPL's route list (ProceduresRoute) and its parts
// share: its cards (routeCard, RouteEnds), its rows (procedures/RouteRows,
// FieldStep) and its chips (procedures/PatternChips, ProcedureSheet).

/** The line that joins the route's points down FPL's list, in the course's
 *  magenta as the map draws the route, at the owner's ask ("draw the
 *  connection with magenta line"); it was the border's grey. The token
 *  (index.css --course, chartColors' COURSE_MAGENTA) rather than the
 *  value, so the Chart ink look's own magenta reaches it. */
export const ROUTE_LINE = { backgroundColor: "var(--course)" } as const;

/** A point's card, where the list is cards (RouteListEdit's `cards`);
 *  dimmed while it is dragged by its row (RouteGrid), where it goes the
 *  stock drop line between the rows. */
export const POINT_CARD = "rounded-2xl bg-card py-3 pr-1.5 pl-3 shadow-sm ring-1 ring-black/5 dark:ring-white/10";
/** The room between a card and the next, the course's line across it. */
export const CARD_GAP = "mb-5.5";

/** A card's runways and procedures, started 20 in, 5 clear of the line
 *  down the marks' column (CardThread), not under the ident's 38 as the
 *  list's are: the room the capsules and pull-downs gain. */
export const CARD_BODY = "pl-5";

/** A chip of the procedures' choices (Chips): a glass capsule 32 high,
 *  its 44-point hit area a pseudo-element six round it. */
export const CHIP = cn(
  "relative h-8 min-w-11 justify-center rounded-full px-3 font-normal",
  GLASS_BUTTON,
  GLASS_PICKED,
  "after:absolute after:-inset-1.5 after:content-['']",
  TEXT.detail,
);
