import { useState, type Ref } from "react";
import { cn } from "cn";
import { parseDate, parseTime, type CalendarDate, type Time } from "@internationalized/date";
import {
  DateField as AriaDateField,
  DateInput,
  DateSegment,
  TimeField as AriaTimeField,
  type DateFieldProps,
  type TimeFieldProps,
} from "react-aria-components";

/**
 * React Aria's date and time fields, where the browser's `<input
 * type="date">` and `type="time"` were: a box of segments (month, day,
 * year; hours, minutes) that every browser draws alike, typed or stepped
 * with the arrow keys, in the stock Input's look (ui/input). Their values
 * stay the strings the native fields gave -- "2026-11-09", "15:00", "" for
 * none -- so a form and the gateway see no change.
 *
 * A finger's 44: the box is 32 or 36, and a band six points proud of it
 * above and below (::after, taking no room) is the box's own, which React
 * Aria answers by focusing a segment -- where FieldHit's label did it for
 * a native field, which a label cannot do for segments.
 */
const BOX =
  "relative flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm pointer-coarse:text-(length:--type-row) dark:bg-input/30 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] data-focus-within:border-ring data-focus-within:ring-2 data-focus-within:ring-ring data-focus-within:ring-offset-2 data-focus-within:ring-offset-background data-disabled:pointer-events-none data-disabled:opacity-50 data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20 dark:data-invalid:border-destructive/50";

/** A segment: the one in focus filled in the tint, as iOS marks the part
 *  of a date being set; a blank one's placeholder grey. */
const SEGMENT =
  "rounded-sm px-px tabular-nums caret-transparent outline-none data-placeholder:text-muted-foreground data-[type=literal]:px-0 data-[type=literal]:text-muted-foreground data-focused:bg-primary data-focused:text-primary-foreground data-focused:data-placeholder:text-primary-foreground";

/** "2026-11-09" as React Aria's day, or null for none or nonsense. */
function dayOf(iso: string | undefined | null): CalendarDate | null {
  if (!iso) return null;
  try {
    return parseDate(iso);
  } catch {
    return null;
  }
}

/** "15:00" as React Aria's time, or null for none or nonsense. */
function timeOf(hhmm: string | undefined | null): Time | null {
  if (!hhmm) return null;
  try {
    return parseTime(hhmm);
  } catch {
    return null;
  }
}

type Own = "value" | "defaultValue" | "onChange" | "minValue" | "maxValue" | "className" | "children";

/** A day, as an ISO date: `value` (or `defaultValue`), `onChange` with each
 *  whole day typed ("" when cleared), `min` and `max` as the native field's
 *  were. The test id is on the box of segments, which a test types into. */
function DateField({
  value,
  defaultValue,
  onChange,
  min,
  max,
  className,
  "data-testid": testId,
  ...props
}: Omit<DateFieldProps<CalendarDate>, Own> & {
  /** React Aria's field's own box, round the segments. */
  ref?: Ref<HTMLDivElement>;
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (iso: string) => void;
  min?: string;
  max?: string;
  className?: string;
  "data-testid"?: string;
}) {
  // Uncontrolled where only a first value is given: what is typed is
  // kept here, as the native field kept its own.
  const [own, setOwn] = useState(() => dayOf(defaultValue));
  const controlled = value !== undefined;
  return (
    <AriaDateField
      {...props}
      value={controlled ? dayOf(value) : own}
      onChange={(day) => {
        if (!controlled) setOwn(day);
        onChange?.(day ? day.toString() : "");
      }}
      minValue={dayOf(min) ?? undefined}
      maxValue={dayOf(max) ?? undefined}
      data-slot="date-field"
      className="min-w-0"
    >
      <DateInput className={cn(BOX, className)} data-testid={testId}>
        {(segment) => <DateSegment segment={segment} className={SEGMENT} />}
      </DateInput>
    </AriaDateField>
  );
}

/** A time of day, "HH:mm" on the 24-hour clock a pilot reads, `onChange`
 *  with each whole time typed. */
function TimeField({
  value,
  onChange,
  className,
  "data-testid": testId,
  ...props
}: Omit<TimeFieldProps<Time>, Own> & {
  value?: string | null;
  onChange?: (hhmm: string) => void;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <AriaTimeField
      hourCycle={24}
      {...props}
      value={timeOf(value)}
      onChange={(time) => onChange?.(time ? time.toString().slice(0, 5) : "")}
      data-slot="time-field"
      className="min-w-0"
    >
      <DateInput className={cn(BOX, className)} data-testid={testId}>
        {(segment) => <DateSegment segment={segment} className={SEGMENT} />}
      </DateInput>
    </AriaTimeField>
  );
}

export { DateField, TimeField };
