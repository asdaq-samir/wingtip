import { Fragment } from "react";
import { cn } from "cn";
import { OTPField } from "@base-ui/react/otp-field";
import { TV_CODE_LENGTH } from "./tvCode";
import { TEXT } from "../../lib/text";

/** Upper case, as the TV shows it: the same however often it is applied,
 *  as OTP Field asks of a normaliser. */
const upper = (value: string) => value.toUpperCase();

/**
 * The box for the code a TV shows (TvLink), as Base UI's OTP Field (web.md
 * §13): a slot a character, the focus moving on as each is typed, a paste
 * of the whole code (its dash and all) filling every slot -- paste is never
 * blocked -- and the letters in capitals. Its type at 20, over the 16 under
 * which iOS zooms into a field; the slots share the width, 44 tall, so the
 * code fits a phone 320 wide. Full, it calls `onComplete`, which sends
 * it; Enter sends the form round it. On its own chunk, as TvLink is
 * (TvLinkHost): only a page opened from a TV's address draws it.
 */
export default function TvCodeField({
  value,
  onChange,
  onComplete,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  invalid: boolean;
}) {
  return (
    <OTPField.Root
      length={TV_CODE_LENGTH}
      validationType="alphanumeric"
      inputMode="text"
      normalizeValue={upper}
      autoComplete="off"
      value={value}
      onValueChange={onChange}
      onValueComplete={onComplete}
      aria-label="The TV's code"
      className="flex w-full items-center justify-center gap-1"
      data-testid="tv-link-code"
    >
      {Array.from({ length: TV_CODE_LENGTH }, (_, i) => (
        <Fragment key={i}>
          {i === TV_CODE_LENGTH / 2 && (
            <span aria-hidden="true" className={cn("px-0.5 text-muted-foreground", TEXT.heading)}>
              -
            </span>
          )}
          <OTPField.Input
            aria-label={`Character ${i + 1} of ${TV_CODE_LENGTH}`}
            aria-invalid={invalid || undefined}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className={cn(
              "h-11 max-w-10 min-w-0 flex-1 rounded-md border border-input bg-transparent text-center font-mono font-semibold uppercase outline-none",
              "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive dark:bg-input/30",
              TEXT.heading,
            )}
          />
        </Fragment>
      ))}
    </OTPField.Root>
  );
}
