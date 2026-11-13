import { useContext, useEffect, useRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "cn";
import { Group, Input, NumberField as AriaNumberField, NumberFieldStateContext, type NumberFieldProps } from "react-aria-components";

/** The stock Input's look (ui/input), on the box round the figure. */
const BOX =
  "relative flex h-9 w-full min-w-0 items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 shadow-xs transition-[color,box-shadow] outline-none dark:bg-input/30 data-focus-within:border-ring data-focus-within:ring-2 data-focus-within:ring-ring data-focus-within:ring-offset-2 data-focus-within:ring-offset-background data-disabled:pointer-events-none data-disabled:opacity-50 data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20 dark:data-invalid:border-destructive/50";

/** The figure: 16 below md so a phone does not zoom on it, a row's to a
 *  finger (lib/text). */
const FIGURE =
  "h-full w-full min-w-0 bg-transparent py-1 text-base tabular-nums outline-none placeholder:text-muted-foreground md:text-sm pointer-coarse:text-(length:--type-row)";

/** The figure as it is typed, each change: React Aria's own reading of the
 *  text (its state's numberValue, parsed in the locale), for a button
 *  whose sense hangs on it (Add, Set) before the field is left. */
function Typed({ onTyped }: { onTyped: (value: number | null) => void }) {
  const state = useContext(NumberFieldStateContext);
  const n = state?.numberValue ?? Number.NaN;
  const was = useRef(n);
  useEffect(() => {
    if (Object.is(n, was.current)) return;
    was.current = n;
    onTyped(Number.isNaN(n) ? null : n);
  }, [n, onTyped]);
  return null;
}

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
 * and a test's fill reach it. `unit` is said inside the box, at its end,
 * `lead` at its start ("FL").
 *
 * The locale is the browser's: the app sets no I18nProvider, so React
 * Aria reads navigator.language, and a pilot whose phone writes 12,5 has
 * it read as twelve and a half, where a hand filter of the text read 125.
 * `onTyped` gives the figure as it is typed, for an uncontrolled field
 * (`defaultValue`) whose Add or Set needs it at once.
 */
function NumberField({
  value,
  defaultValue,
  onChange,
  id,
  placeholder,
  unit,
  lead,
  onTyped,
  enterKeyHint,
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
  lead?: ReactNode;
  onTyped?: (value: number | null) => void;
  enterKeyHint?: InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
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
      {onTyped && <Typed onTyped={onTyped} />}
      <Group className={cn(BOX, className)}>
        {lead != null && <span className="shrink-0 text-sm text-muted-foreground">{lead}</span>}
        <Input id={id} placeholder={placeholder} enterKeyHint={enterKeyHint} data-testid={testId} className={cn(FIGURE, inputClassName)} />
        {unit != null && <span className="shrink-0 text-sm text-muted-foreground">{unit}</span>}
      </Group>
    </AriaNumberField>
  );
}

export { NumberField };
