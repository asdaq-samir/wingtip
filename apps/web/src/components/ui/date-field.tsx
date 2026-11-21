import { Suspense, lazy, useState, type FocusEventHandler, type KeyboardEventHandler, type Ref } from "react";
import { cn } from "cn";
import { dayMonthYear, fromIso } from "../../lib/format";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "../ResponsivePopover";
import { Button } from "./button";

/** The month grid is React Aria's, only ever seen once the field is
 *  tapped -- so it arrives then, not with the page. */
const DayCalendar = lazy(() => import("./calendar").then((m) => ({ default: m.DayCalendar })));

/**
 * A day, as iOS's compact date picker is: one button showing the day ("31
 * Dec 2027"), a tap opening the calendar (React Aria's, ui/calendar) in a
 * popover, a card on a phone, with the month and year as pull-downs to
 * jump by, a day's tap picking it and closing. Where it was React Aria's
 * DateField, a box of month, day and year segments some 20 points wide and
 * 25 apart, which no finger could each hit and no 44-point square could
 * each own without one covering the next (the iOS audit's P1 on the
 * Logbook's Instructing page; the owner, 2026-11-21: "one button ... as
 * iOS does"). Its value stays the string the field gave -- "2026-11-09",
 * "" for none -- so a form and the gateway see no change; Clear, where a
 * day is set, gives "".
 *
 * Its name holds the day in sight, the field's label and "change" round
 * it ("Certificate expires, 31 Dec 2027: change"; WCAG 2.5.3).
 */
function DateField({
  value,
  defaultValue,
  onChange,
  onBlur,
  onKeyDown,
  min,
  max,
  id,
  isInvalid,
  className,
  ref,
  "aria-label": label,
  "aria-describedby": describedBy,
  "data-testid": testId,
}: {
  ref?: Ref<HTMLButtonElement>;
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (iso: string) => void;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
  /** A form's own keys on the button (Escape to cancel its row). */
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  min?: string;
  max?: string;
  id?: string;
  /** Marked wrong, as ariaInvalid says it. */
  isInvalid?: boolean;
  className?: string;
  "aria-label": string;
  "aria-describedby"?: string;
  "data-testid"?: string;
}) {
  // Uncontrolled where only a first value is given: what is picked is
  // kept here, as the segmented field kept its own.
  const [own, setOwn] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const day = (value !== undefined ? value : own) ?? "";
  const pick = (iso: string) => {
    if (value === undefined) setOwn(iso);
    onChange?.(iso);
  };
  const shown = /^\d{4}-\d\d-\d\d$/.test(day) ? dayMonthYear(fromIso(day)) : "";
  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <Button
          ref={ref}
          id={id}
          type="button"
          variant="secondary"
          size="sm"
          aria-invalid={isInvalid || undefined}
          aria-label={`${label}, ${shown || "none"}: change`}
          aria-describedby={describedBy}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          data-slot="date-field"
          data-testid={testId}
          // A finger's 44 round its 32: a band eight proud above and below,
          // taking no room.
          className={cn(
            "relative justify-start font-normal tabular-nums after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']",
            className,
          )}
        >
          {shown || <span className="text-muted-foreground">None</span>}
        </Button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        title={label}
        className="w-auto p-0"
        align="start"
        leading={
          day ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-tint"
              onClick={() => {
                pick("");
                setOpen(false);
              }}
              data-testid={testId ? `${testId}-clear` : undefined}
            >
              Clear
            </Button>
          ) : undefined
        }
      >
        <div className="flex justify-center pb-3">
          {/* Sized like the grid it stands in for, so the popover does
              not jump once it arrives. */}
          <Suspense fallback={<div className="h-[21rem] w-[17rem]" />}>
            <DayCalendar
              aria-label={label}
              value={shown ? day : null}
              captionLayout="dropdown"
              min={min}
              max={max}
              onChange={(iso) => {
                pick(iso);
                setOpen(false);
              }}
            />
          </Suspense>
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}

export { DateField };
