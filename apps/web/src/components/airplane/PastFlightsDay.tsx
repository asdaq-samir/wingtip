import { lazy, Suspense, useState } from "react";
import { ListGroup, ListRow } from "../GroupedList";
import { ResponsivePopover, ResponsivePopoverAnchor, ResponsivePopoverContent } from "../ResponsivePopover";
import { Button } from "../ui/button";
import { localDay } from "../../lib/format";
import { dayOf } from "./pastFlightFormat";

// The stock calendar, as the departure's picker has it (DepartPicker):
// its own chunk, asked for once a day is to be picked.
const DayCalendar = lazy(() => import("../ui/calendar").then((m) => ({ default: m.DayCalendar })));

/** How far back a day may be picked: adsb.lol's archive (wingtip.traffic
 *  ARCHIVE_DAYS), today among them. */
const ARCHIVE_DAYS = 42;

/** A day, ISO (the planner's `until`): the calendar's day as it shows it,
 *  where an ISO string of its local midnight was the day before east of
 *  Greenwich. */
const isoDay = (d: Date) => localDay(d);

/**
 * The day an airplane's past flights are listed from (PastFlights), picked
 * on the stock calendar in a sheet, as the departure's day is: the phone's
 * own date field showed an empty box until one was picked (the owner's
 * phone). The archive's days alone can be picked; Latest goes back to the
 * last flights found.
 */
export default function PastFlightsDay({ from, onPick }: { from: string | null; onPick: (day: string | null) => void }) {
  const [picking, setPicking] = useState(false);
  const today = new Date();
  const earliest = new Date(today.getTime() - (ARCHIVE_DAYS - 1) * 86_400_000);
  const picked = from ? new Date(`${from}T12:00:00Z`) : undefined;
  return (
    <ResponsivePopover open={picking} onOpenChange={setPicking}>
      <ResponsivePopoverAnchor asChild>
        <div>
          <ListGroup>
            <ListRow
              title="Flights before a date"
              value={picked ? dayOf(picked) : "Pick a day"}
              chevron
              onClick={() => setPicking(true)}
              data-testid="past-flights-date"
            />
          </ListGroup>
        </div>
      </ResponsivePopoverAnchor>
      {/* Its Done at the foot its way out (no close). */}
      <ResponsivePopoverContent title="Flights before a date" className="w-auto p-0" align="start" closeButton={false}>
        <div className="flex flex-col items-center gap-3 pb-3" data-testid="past-flights-picker">
          <Suspense fallback={<div className="h-[21rem] w-[17rem]" />}>
            <DayCalendar
              aria-label="Flights before a date"
              value={from}
              min={isoDay(earliest)}
              max={isoDay(today)}
              onChange={(day) => {
                onPick(day);
                setPicking(false);
              }}
            />
          </Suspense>
          <div className="flex items-center gap-2 px-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-tint"
              disabled={!from}
              onClick={() => {
                onPick(null);
                setPicking(false);
              }}
              data-testid="past-flights-latest"
            >
              Latest
            </Button>
            <Button type="button" size="sm" onClick={() => setPicking(false)}>
              Done
            </Button>
          </div>
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}
