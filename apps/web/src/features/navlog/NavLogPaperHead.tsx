import { cn } from "cn";
import { plannedWords } from "../plan";
import type { Totals } from "../../lib/api/types";
import { weekdayDayMonthTime } from "../../lib/format";
import { TEXT } from "../../lib/text";

/** On paper only, at paper's own 14: no finger, no type scale. The panel's
 *  own head (the route form, the airplane and the departure time) is
 *  print:hidden, so they are named here instead, as a line of text. */
export function NavLogPaperHead({
  title,
  aircraftLabel,
  depart,
  totals,
}: {
  title: string;
  aircraftLabel: string;
  depart: string;
  totals: Totals | null;
}) {
  return (
    <div className={cn("hidden flex-col gap-1 border-b border-border px-4 py-3 print:flex", TEXT.detail)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("font-semibold", TEXT.title)}>Wingtip Maps</span>
        <span className="text-muted-foreground">{title}</span>
      </div>
      <div className="text-muted-foreground">
        {aircraftLabel}
        {depart && ` · departing ${weekdayDayMonthTime(new Date(depart))}`}
        {plannedWords(totals) && ` · ${plannedWords(totals)}`}
      </div>
    </div>
  );
}
