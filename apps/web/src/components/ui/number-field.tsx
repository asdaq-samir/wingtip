import type { ReactNode } from "react";
import { cn } from "cn";
import { Group, Input, NumberField as AriaNumberField, type NumberFieldProps } from "react-aria-components";

/** The stock Input's look (ui/input), on the box round the figure. */
const BOX =
  "relative flex h-9 w-full min-w-0 items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 shadow-xs transition-[color,box-shadow] outline-none dark:bg-input/30 data-focus-within:border-ring data-focus-within:ring-2 data-focus-within:ring-ring data-focus-within:ring-offset-2 data-focus-within:ring-offset-background data-disabled:pointer-events-none data-disabled:opacity-50 data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20 dark:data-invalid:border-destructive/50";

/** The figure: 16 below md so a phone does not zoom on it, a row's to a
 *  finger (lib/text). */
const FIGURE =
  "h-full w-full min-w-0 bg-transparent py-1 text-base tabular-nums outline-none placeholder:text-muted-foreground md:text-sm pointer-coarse:text-(length:--type-row)";

/**
 * React Aria's number field, where `<input type="number">` and the
 * figures typed as text (inputMode decimal) were: the figure parsed and
 * written in the pilot's locale, the keyboard a figure's (decimal, or
 * numeric where no fraction is allowed), the arrow keys stepping it, and
 * the figure taken as it is left (Enter or a tap away), as a native one
 * gave it. No grouping by default ("2550", not "2,550"): a pilot reads a
 * weight or an hour meter as it is written in the book.
 *
 * Its value is a number, null for none (React Aria's NaN). The test id and
 * the id are on the figure itself, so a label's htmlFor (FieldHit's 44)
 * and a test's fill reach it. `unit` is said inside the box, at its end.
 */
function NumberField({
  value,
  defaultValue,
  onChange,
  id,
  placeholder,
  unit,
  className,
  inputClassName,
  formatOptions,
  "data-testid": testId,
  ...props
}: Omit<NumberFieldProps, "value" | "defaultValue" | "onChange" | "className" | "children"> & {
  value?: number | null;
  defaultValue?: number | null;
  onChange?: (value: number | null) => void;
  id?: string;
  placeholder?: string;
  unit?: ReactNode;
  className?: string;
  inputClassName?: string;
  "data-testid"?: string;
}) {
  return (
    <AriaNumberField
      {...props}
      value={value === undefined ? undefined : (value ?? Number.NaN)}
      defaultValue={defaultValue === undefined ? undefined : (defaultValue ?? Number.NaN)}
      onChange={(n) => onChange?.(Number.isNaN(n) ? null : n)}
      formatOptions={formatOptions ?? { useGrouping: false, maximumFractionDigits: 3 }}
      data-slot="number-field"
      className="min-w-0"
    >
      <Group className={cn(BOX, className)}>
        <Input id={id} placeholder={placeholder} data-testid={testId} className={cn(FIGURE, inputClassName)} />
        {unit != null && <span className="shrink-0 text-sm text-muted-foreground">{unit}</span>}
      </Group>
    </AriaNumberField>
  );
}

export { NumberField };
