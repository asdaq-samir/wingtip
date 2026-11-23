import { Suspense, useState } from "react";
import { clockTime, localDay, zoneName } from "../../lib/format";
import { dayAtNextHour, leaveWhen } from "../../lib/format/leaveWhen";
import { CalendarIcon } from "lucide-react";
import { Button } from "../../components/ui/button";
import { fromChunk } from "../../lib/fromChunk";

/** The month grid and the time's wheels are React Aria's, only ever seen
 *  inside this popover -- so they arrive with it rather than with the
 *  page: one chunk for both (departPickerParts), asked as the trigger is
 *  touched, hovered or focused, ahead of the tap's open, and drawn from
 *  its module once in (fromChunk), where two `lazy()`s were each fetched
 *  only at the open and suspended it once more (the speed audit of
 *  2026-11-21). */
const loadParts = () => import("./departPickerParts");
const { Part: DayCalendar, prefetch: prefetchCalendar } = fromChunk(loadParts, (m) => m.DayCalendar);
const { Part: TimeField, prefetch: prefetchTime } = fromChunk(loadParts, (m) => m.TimeField);
const prefetchParts = () => {
  prefetchCalendar();
  prefetchTime();
};
/** The trigger's intent: a touch, a hover or a focus asks for the parts. */
const INTENT = { onPointerDown: prefetchParts, onPointerEnter: prefetchParts, onFocus: prefetchParts };
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "../../components/ResponsivePopover";
import { cn } from "cn";
import { CHIP_TEXT } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";
import { useMinuteClock } from "../../lib/useMinuteClock";

interface Props {
  /** The departure as an ISO instant, or "" for about now. */
  value: string;
  onChange: (iso: string) => void;
  /** A chip of glass, or the time in the tint as the departure's step in
   *  FPL's list says it ("09:00"), where the owner moved it. */
  look?: "chip" | "time";
  /** What it is the time of: the flight's departure, or a stop's leaving
   *  again ("Departure from KMSN"). */
  label?: string;
  testId?: string;
  /** Leave Now, back to about now: the flight's own departure's; a stop
   *  has no "now" to go back to. */
  leavesNow?: boolean;
  /** The earliest and latest it may be, ms since 1970: a stop's leaving,
   *  from its landing to a day after, as the planner takes a stop's time
   *  on the ground. A time picked outside is brought inside and said so. */
  earliest?: number;
  latest?: number;
  /** The zone said right after the clock's time under "Now" ("14:05
   *  CST"), as every time in FPL's list has its zone after it; none
   *  where no point keeps another clock. */
  zone?: string;
}

/** The instant of a calendar day at a local "HH:mm". */
function instantAt(day: Date, time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0).toISOString();
}

/**
 * When the flight leaves: one compact field, "Now" or "Sat 18:00", that
 * opens shadcn's own date picker -- the calendar in a popover, a sheet on
 * a phone -- with the time over it and Now to go back to about
 * now, instead of the browser's `datetime-local` control, which every
 * browser draws its own way. The day and the time are one value to the
 * caller, an ISO instant: a new day keeps the time (or takes the next
 * whole hour), a new time keeps the day.
 */
export default function DepartPicker({
  value,
  onChange: change,
  look = "chip",
  label = "Departure",
  testId = "depart-date",
  leavesNow = true,
  earliest,
  latest,
  zone,
}: Props) {
  const [open, setOpen] = useState(false);
  // A pick outside its range, brought inside: said under the time, where
  // it was picked, until the next pick.
  const [held, setHeld] = useState(false);
  const onChange = (iso: string) => {
    const ms = iso ? Date.parse(iso) : NaN;
    const kept = Number.isNaN(ms) ? ms : Math.min(latest ?? Infinity, Math.max(earliest ?? -Infinity, ms));
    setHeld(kept !== ms);
    change(Number.isNaN(ms) || kept === ms ? iso : new Date(kept).toISOString());
  };
  const parsed = value ? new Date(value) : undefined;
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
  const time = date ? clockTime(date) : "";
  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        {look === "time" ? (
          <Button
            variant="link"
            size="inline"
            data-testid={testId}
            {...INTENT}
            className={cn(
              // 44 tall round its 20 (12 over and under), so a tap just
              // above or below "Now" picks the time, not the field's row
              // toggle under it (the audit's WEB-5); 10 either side.
              "relative shrink-0 gap-0.5 font-semibold tabular-nums hit-x-2.5 hit-y-3",
              TEXT.detail,
            )}
          >
            {/* The tint alone says it opens, as every other tappable
                figure's does: no chevron after it (the owner's list,
                2026-11-17, "Now ⌄"). "Now" says the clock's time under it
                (the owner, 2026-11-19: "Can depart time show under now?"). */}
            {/* Its name is what it shows, the label and "change" round it for
                a screen reader alone, so the name holds the words in sight,
                the clock under "Now" too (WCAG 2.5.3, Label in Name; axe's
                label-content-name-mismatch, a11y.spec's Nav Log). */}
            <span className="sr-only">{label}, </span>
            {date ? (
              <span className="whitespace-nowrap">
                {leaveWhen(date)}
                {zone ? <span className={cn("ml-1 font-normal text-foreground", TEXT.caption)}>{zone}</span> : null}
              </span>
            ) : (
              // Each line at its own size's leading (TEXT.detail's), as
              // the iOS audit's P3 asks: tightened, "Now" sat on 18.8.
              <span className="flex flex-col items-end">
                Now
                <NowTime zone={zone} />
              </span>
            )}
            <span className="sr-only">: change</span>
          </Button>
        ) : (
          <Button
            // A chip of glass, as Maps' filter chips are: the time in the
            // text's colour, not a button's tint, at a note's 13 (TEXT), as
            // the airplane beside it (FlightInputs).
            variant="glass"
            size="sm"
            // Over the head under it (z-10), whose row starts inside its
            // 44-point area's foot, and 4 more after the pill before it,
            // whose end's glyph's area runs 12 past that pill (pillLook's
            // PILL_END): its own area's edge clear of both (the iOS
            // audit's P1, "Departure date" 57×32 on a local flight).
            className={cn("relative z-10 ml-1 rounded-full px-2.5 font-normal pointer-coarse:px-1.5", CHIP_TEXT)}
            data-testid={testId}
            {...INTENT}
          >
            {/* Named by what it shows, its label before it for a screen
                reader alone, as the time's look is: "Departure date" held
                none of the "Now" in sight (WCAG 2.5.3, Label in Name; axe's
                label-content-name-mismatch on a local flight). */}
            <span className="sr-only">{label}, </span>
            {!date && <CalendarIcon className="text-muted-foreground" aria-hidden="true" />}
            {date ? leaveWhen(date) : "Now"}
          </Button>
        )}
      </ResponsivePopoverTrigger>
      {/* A sheet from the bottom on a phone. Done at the top, as an iOS
          sheet puts it, and Now at its start where there is a "now" to go
          back to and the departure is not now already; the time above the calendar, so at half both the way
          out and the time picked are in view, and the calendar may run on
          under the fold (the UI audit's B7, the owner's word 2026-11-17). */}
      <ResponsivePopoverContent
        title={label}
        description={date ? `Leaving ${leaveWhen(date)}` : "Leaving now"}
        className="w-auto"
        bleed
        align="start"
        closeButton={false}
        leading={
          // Now only once a time is picked: leaving now already, there is
          // nothing to go back to, and a greyed Now was one more control
          // that did nothing (the owner's list, 2026-11-17).
          leavesNow && date ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-tint"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              data-testid="depart-clear"
            >
              Now
            </Button>
          ) : undefined
        }
        action={
          <Button type="button" size="sm" onClick={() => setOpen(false)} data-testid="depart-done">
            Done
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-3 pb-3" data-testid="depart-picker">
          {/* The time once a day is picked -- picking one gives it the
              next whole hour: one button showing it, the zone after it, a
              tap opening the hours and minutes as two wheels under it, as
              iOS's compact time picker does (ui/time-field; the owner,
              2026-11-21), on the 24-hour clock. */}
          {date && (
            <Suspense fallback={<div className="h-8 w-28" />}>
              <TimeField
                value={time}
                zone={zoneName(date)}
                onChange={(hhmm) => onChange(instantAt(date, hhmm))}
                aria-label={`${label} time`}
                data-testid="depart-time"
              />
            </Suspense>
          )}
          {held && earliest != null && latest != null && (
            <p className={cn("px-3 text-caution-ink", TEXT.note)} role="status" data-testid="depart-range">
              From landing, {clockTime(new Date(earliest))}, to a day after.
            </p>
          )}
          {/* Sized like the grid it stands in for, so the popover does
              not jump once it arrives. */}
          <Suspense fallback={<div className="h-[21rem] w-[17rem]" />}>
            <DayCalendar
              aria-label={label}
              value={date ? localDay(date) : null}
              captionLayout="dropdown"
              min={earliest != null ? localDay(new Date(earliest)) : undefined}
              max={latest != null ? localDay(new Date(latest)) : undefined}
              onChange={(day) => onChange(time ? instantAt(new Date(`${day}T00:00`), time) : dayAtNextHour(new Date(`${day}T00:00`)))}
            />
          </Suspense>
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}

/** The time now, under "Now", kept to the minute, its zone after it. */
function NowTime({ zone }: { zone?: string }) {
  const now = useMinuteClock();
  return (
    <span className={cn("font-normal whitespace-nowrap text-muted-foreground", TEXT.caption)}>
      {clockTime(new Date(now))}
      {zone ? ` ${zone}` : null}
    </span>
  );
}
