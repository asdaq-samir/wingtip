import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import {
  Button as AriaButton,
  Calendar as AriaCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarHeading,
  CalendarMonthPicker,
  CalendarYearPicker,
  type CalendarProps,
  type DateValue,
} from "react-aria-components";
import { parseDate, type CalendarDate } from "@internationalized/date";

import PullDown from "../PullDown";
import { buttonVariants } from "./button";

/** The month's arrows: React Aria's own buttons, its slots paging the
 *  grid, in a ghost icon button's look. */
const NAV = cn(
  buttonVariants({ variant: "ghost", size: "icon" }),
  "pointer-events-auto size-(--cell-size) p-0 select-none data-disabled:opacity-50 pointer-coarse:m-1 pointer-coarse:size-9",
);

/**
 * shadcn's React Aria calendar (its aria-vega style), a month's grid of
 * days for the pickers that want one (DepartPicker, PastFlights), where it
 * was react-day-picker's. Ours: a finger's 44 a day (--cell-size), the
 * day's number at iOS's 20, the arrows an icon button's 36 with their 44
 * round them (index.css), and the month and year as the app's one
 * pull-down (PullDown), where shadcn's are its own Select.
 */
function Calendar<T extends DateValue>({
  className,
  captionLayout = "label",
  ...props
}: Omit<CalendarProps<T>, "visibleDuration" | "className"> & {
  className?: string;
  /** The month and year as menus to jump by, or the month's name alone. */
  captionLayout?: "label" | "dropdown";
}) {
  return (
    <AriaCalendar
      {...props}
      data-slot="calendar"
      className={cn(
        "group/calendar w-fit bg-background p-3 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(8)] pointer-coarse:[--cell-size:--spacing(11)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        className,
      )}
    >
      <div className="relative flex flex-col gap-4">
        {/* Clear to the pointer but for its buttons: across the caption's
            whole width, it took the month and year menus' taps. */}
        <header className="pointer-events-none absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1">
          <AriaButton slot="previous" className={NAV}>
            <ChevronLeftIcon className="size-4 pointer-coarse:size-5" />
          </AriaButton>
          <AriaButton slot="next" className={NAV}>
            <ChevronRightIcon className="size-4 pointer-coarse:size-5" />
          </AriaButton>
        </header>
        <div className="flex w-full flex-col gap-4">
          <div className="flex h-(--cell-size) w-full items-center justify-center gap-3 px-(--cell-size) text-sm font-medium pointer-coarse:text-(length:--type-row) pointer-coarse:font-semibold">
            {captionLayout === "dropdown" ? (
              <>
                <CalendarMonthPicker>
                  {(p) => (
                    <PullDown
                      label={p["aria-label"]}
                      value={String(p.value)}
                      options={p.items.map((i) => ({ value: String(i.id), label: i.formatted }))}
                      onChange={(v) => p.onChange(Number(v))}
                      align="center"
                    />
                  )}
                </CalendarMonthPicker>
                <CalendarYearPicker>
                  {(p) => (
                    <PullDown
                      label={p["aria-label"]}
                      value={String(p.value)}
                      options={p.items.map((i) => ({ value: String(i.id), label: i.formatted }))}
                      onChange={(v) => p.onChange(Number(v))}
                      align="center"
                    />
                  )}
                </CalendarYearPicker>
              </>
            ) : (
              <CalendarHeading className="select-none" />
            )}
          </div>
          <CalendarGrid className="w-full border-collapse">
            <CalendarGridHeader>
              {(day) => (
                // A note's size and its iOS leading (TEXT.note, 13 on 18
                // to a finger), where the stock 0.8rem stood on 1.5.
                <CalendarHeaderCell className="rounded-(--cell-radius) text-xs font-normal text-muted-foreground select-none pointer-coarse:text-(length:--type-note) pointer-coarse:leading-[1.125rem]">
                  {day}
                </CalendarHeaderCell>
              )}
            </CalendarGridHeader>
            <CalendarGridBody>
              {(date) => (
                <CalendarCell
                  date={date}
                  data-day={date.toString()}
                  className="group/day relative mt-2 aspect-square size-(--cell-size) cursor-default rounded-(--cell-radius) p-0 text-center outline-none select-none data-outside-month:text-muted-foreground data-disabled:text-muted-foreground data-disabled:opacity-50 data-unavailable:text-muted-foreground data-unavailable:line-through"
                >
                  {({ formattedDate, isSelected, isFocusVisible }) => (
                    // A day's number in its cell's colour (muted outside the
                    // month), not the ghost button's tint: only the chosen
                    // day is in the tint, filled. 20 points to a finger, as
                    // iOS's calendar sets its days.
                    <div
                      data-selected-single={isSelected}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "icon" }),
                        "relative isolate z-10 flex aspect-square size-full min-w-(--cell-size) border-0 leading-none font-normal text-inherit pointer-coarse:text-xl pointer-coarse:leading-[1.5625rem]",
                        isFocusVisible && "z-10 ring-2 ring-ring",
                        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground",
                      )}
                    >
                      {formattedDate}
                    </div>
                  )}
                </CalendarCell>
              )}
            </CalendarGridBody>
          </CalendarGrid>
        </div>
      </div>
    </AriaCalendar>
  );
}

/** "2026-11-09" as the calendar's day, or undefined for none or nonsense. */
function dayOf(iso: string | null | undefined): CalendarDate | undefined {
  if (!iso) return undefined;
  try {
    return parseDate(iso);
  } catch {
    return undefined;
  }
}

/**
 * The calendar with ISO days in and out ("2026-11-09"), for the pickers
 * that load it on their first opening: its date type stays in this chunk
 * with it, not in the page that opens it.
 */
function DayCalendar({
  value,
  min,
  max,
  onChange,
  ...props
}: Omit<CalendarProps<CalendarDate>, "value" | "minValue" | "maxValue" | "onChange" | "visibleDuration" | "className"> & {
  value: string | null;
  min?: string;
  max?: string;
  onChange: (iso: string) => void;
  captionLayout?: "label" | "dropdown";
}) {
  return (
    <Calendar
      {...props}
      value={dayOf(value) ?? null}
      defaultFocusedValue={dayOf(value) ?? dayOf(max)}
      minValue={dayOf(min)}
      maxValue={dayOf(max)}
      onChange={(day: CalendarDate) => onChange(day.toString())}
    />
  );
}

export { Calendar, DayCalendar };
