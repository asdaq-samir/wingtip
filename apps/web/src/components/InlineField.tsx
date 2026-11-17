import type { ComponentPropsWithRef, ElementType, ReactNode } from "react";
import { cn } from "cn";
import { TEXT } from "../lib/text";
import { InputGroup, InputGroupInput } from "./ui/input-group";

/**
 * A short field in the route box's row with a glass button at its end --
 * the airplane's N-number (FlightInputs) and the cruise altitude
 * (AltitudeGroup) -- one component where the two were near-copies (the 23
 * Oct audit). shadcn's InputGroup round shadcn's InputGroupInput (the
 * owner, 2026-11-17: stock over our own), the group drawing the stock
 * focus ring round the pill while its field has the keyboard's focus,
 * keeping what the owner asked of them:
 * - 28 tall, the route box's fill and type, at least 16 px (the stock
 *   input's text-base; under 16 iOS zooms the page in on a field), the
 *   row's 17 to a finger;
 * - one width whatever is in it ("Keep these inputs fixed size"): the
 *   widest value and the button, and the example, measured unseen in the
 *   one cell, emptied it keeps it and shows its example;
 * - six points between the text and the button ("Does the button need to
 *   have that much spacing"), the field over the button's area where the
 *   two meet, so a tap at the text's end is the field's ("not letting me
 *   clear them").
 */
export function InlineField({
  label,
  testId,
  widest,
  tabular = false,
  placeholder,
  placeholderClassName,
  hint,
  shrink = false,
  input,
  inputClassName,
  button,
  endRoom = "w-[1.5625rem]",
  field: Field,
}: {
  /** The input's element where it is more than the stock input: a list's
   *  own field where it suggests as it is typed (the airplane's, Base UI's
   *  Autocomplete.Input through CommandField), drawn as the InputGroupInput
   *  (its `render`). */
  field?: ElementType;
  /** Grey words after a fixed start the field keeps in its text (the
   *  airplane's "N-"), in the example's style, while nothing is typed
   *  after it: the input's own placeholder shows only while it is empty,
   *  which a fixed start never is. Room kept for it, as for the example. */
  hint?: { start: string; words: string };
  /** The room kept at its end for its button, so the field does not
   *  widen as one comes: none where it has none (the airplane's, since
   *  its card button went), a dot's for the altitude's caution. */
  endRoom?: string;
  /** The group's name, for VoiceOver. */
  label: string;
  testId?: string;
  /** The widest value it takes, for its one width. */
  widest: string;
  /** Figures that line up as they change (the altitude's). */
  tabular?: boolean;
  placeholder: string;
  /** The example's own size where it is not the row's. */
  placeholderClassName?: string;
  /** Keeps its width in a row too narrow for everything. */
  shrink?: boolean;
  input: Omit<ComponentPropsWithRef<"input">, "className" | "placeholder"> & { "data-testid"?: string };
  inputClassName?: string;
  /** At its end, shown when it has something to open. */
  button?: ReactNode;
}) {
  // The stock InputGroupInput, its own size and padding set to the pill's:
  // the words the group's size (inherit), never under the stock input's 16.
  const look = cn(
    "relative z-10 h-full w-0 min-w-0 flex-1 py-0 pr-0.5 pl-2.5 font-semibold placeholder:font-normal",
    "text-[length:inherit] md:text-[length:inherit] pointer-coarse:text-[length:inherit]",
    tabular && "tabular-nums",
    inputClassName,
  );
  const shared = { type: "text", autoComplete: "off", enterKeyHint: "done" as const, size: 1, placeholder, ...input };
  return (
    // A row's size to a finger, but no larger than it is at the owner's
    // 17.88 px text (19 px): at 19.65 the two chips and the route's three
    // round buttons came to 10-15 points more than a 390-point phone's
    // line, and the buttons wrapped onto a line of their own (the FPL
    // audit's A3; the owner's route-box-buttons rule, 2026-10-24: one line
    // at their text sizes). The field is 28 tall whatever its text. The
    // stock group's line, shade and full width put away for the pill.
    <InputGroup
      aria-label={label}
      className={cn(
        "grid h-7 w-auto items-center rounded-full border-0 bg-foreground/8 shadow-none dark:bg-foreground/8",
        shrink && "shrink-0",
        TEXT.row,
        "pointer-coarse:text-[length:min(1.0625rem,19px)]",
      )}
      data-testid={testId}
    >
      <span aria-hidden="true" className="invisible col-start-1 row-start-1 flex h-0 overflow-hidden">
        <span className={cn("whitespace-pre pr-1.5 pl-2.5 font-semibold", tabular && "tabular-nums")}>{widest}</span>
        <span className={cn(endRoom, "shrink-0")} />
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-pre pr-1.5 pl-2.5 font-normal",
          placeholderClassName,
        )}
      >
        {placeholder}
      </span>
      {hint && (
        <span aria-hidden="true" className="invisible col-start-1 row-start-1 flex h-0 overflow-hidden whitespace-pre pr-1.5 pl-2.5">
          <span className="font-semibold">{hint.start}</span>
          <span className={cn("font-normal", placeholderClassName)}>{hint.words}</span>
          <span className={cn(endRoom, "shrink-0")} />
        </span>
      )}
      <div className="col-start-1 row-start-1 flex h-full min-w-0 items-center">
        <label className="relative flex h-full min-w-0 flex-1 items-center pr-1 after:absolute after:-inset-y-2 after:-left-0.5 after:right-0 after:content-['']">
          {Field ? <Field {...shared} render={<InputGroupInput className={look} />} /> : <InputGroupInput {...shared} className={look} />}
          {hint && input.value === hint.start && (
            // Over the input, after its text (laid out unseen beside it),
            // never in a tap's way, cut at the field's end where the field
            // gives way in a full row (it ran under the altitude beside it
            // at 19.65 px). Grey, but the text's own colour faded
            // rather than the muted grey, which fell to 3.9:1 (and at 60% 4.4:1) on the
            // field's fill in dark (the iOS audit's P15 asks 4.5).
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 left-0 z-10 flex items-center overflow-hidden whitespace-pre pl-2.5"
              data-testid={testId ? `${testId}-hint` : undefined}
            >
              <span className="invisible font-semibold">{hint.start}</span>
              <span className={cn("font-normal text-foreground/70", placeholderClassName)}>{hint.words}</span>
            </span>
          )}
        </label>
        {button}
      </div>
    </InputGroup>
  );
}
