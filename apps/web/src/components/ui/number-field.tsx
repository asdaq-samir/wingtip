import { useContext, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "cn";
import { Group, Input, NumberField as AriaNumberField, NumberFieldStateContext, type NumberFieldProps } from "react-aria-components";

/** The stock Input's look (ui/input), on the box round the figure. */
const BOX =
  "relative flex h-9 w-full min-w-0 items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 shadow-xs transition-[color,box-shadow] outline-none dark:bg-input/30 data-focus-within:border-ring data-focus-within:ring-2 data-focus-within:ring-ring data-focus-within:ring-offset-2 data-focus-within:ring-offset-background data-disabled:pointer-events-none data-disabled:opacity-50 data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20 dark:data-invalid:border-destructive/50";

/** The figure: 16 wherever a finger types it, so iOS does not zoom in on
 *  a field under 16 (an iPad in the Native look, which takes no
 *  pointer-coarse size, too), 14 with a mouse from md, a row's to a finger
 *  in Wingtip's looks (lib/text). */
const FIGURE =
  "h-full w-full min-w-0 bg-transparent py-1 text-base tabular-nums outline-none placeholder:text-muted-foreground md:pointer-fine:text-sm pointer-coarse:text-(length:--type-row)";
const UNIT = "shrink-0 text-sm text-muted-foreground pointer-coarse:text-(length:--type-row)";

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
 * `lead` at its start ("FL"), both at the figure's own size under a
 * finger (Body, 17), as an iOS field writes its unit: at 14 they were off
 * the type scale (the HIG review's "gal", 2026-11-21).
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
  // Done unless a field names its own: the figure is taken as Enter
  // leaves it, and iOS's return key says so (the iOS audit's P19, the
  // holding and lost-communications practice pages).
  enterKeyHint = "done",
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
  // Figures padded to three (THREE_FIGURES' minimumIntegerDigits, a flight
  // level's 045 or a course's 090) are written so only once the field is
  // left: padded as it was typed in, React Aria read each Backspace of
  // "025" as a new figure padded again, "99" and then "9", and the field
  // could not be emptied (the owner, 2026-11-22: "FL input is not letting
  // me clear it").
  const [typing, setTyping] = useState(false);
  const shown = formatOptions ?? { useGrouping: false, maximumFractionDigits: 3 };
  const { minimumIntegerDigits: _padded, ...unpadded } = shown;
  return (
    <AriaNumberField
      {...props}
      onFocusChange={(focused) => {
        setTyping(focused);
        props.onFocusChange?.(focused);
      }}
      value={value === undefined ? undefined : (value ?? Number.NaN)}
      defaultValue={defaultValue === undefined ? undefined : (defaultValue ?? Number.NaN)}
      onChange={(n) => onChange?.(Number.isNaN(n) ? null : n)}
      formatOptions={typing ? unpadded : shown}
      data-slot="number-field"
      className="min-w-0"
    >
      {onTyped && <Typed onTyped={onTyped} />}
      <Group className={cn(BOX, className)}>
        {lead != null && <span className={UNIT}>{lead}</span>}
        <Input id={id} placeholder={placeholder} enterKeyHint={enterKeyHint} data-testid={testId} className={cn(FIGURE, inputClassName)} />
        {unit != null && <span className={UNIT}>{unit}</span>}
      </Group>
    </AriaNumberField>
  );
}

export { NumberField };
