import { Button as BaseButton } from "@base-ui/react/button";
import { Check } from "lucide-react";
import { mhzText } from "../lib/frequencies";
import { showError } from "../lib/problems";
import { useCopied } from "../lib/share";

/**
 * A frequency wherever it is shown -- an airport's card and its Brief
 * sections, the pattern's radio calls, an airspace's who to call, the
 * emergency's channels, a clearance read back -- as pilots write it, and
 * a tap copies it, for a radio's or another app's own field: the same
 * verb, Copy, as every platform's (docs/navigation.md). "Copied" says so
 * where it was tapped for a moment. The web reaches no radio, so it has
 * no Tune: listening through the microphone (lib/listen) hears what the
 * pilot tuned, it tunes nothing.
 *
 * Tinted, as everything tapped is; its 44-point hit area is a
 * pseudo-element round it, the figure not grown (CLAUDE.md).
 */
export default function FrequencyButton({
  mhz,
  name,
  named,
  testId = "frequency-copy",
}: {
  /** The figure, or as heard ("124.35" in a clearance). */
  mhz: number | string;
  /** Whom it is for ("Tower", "Minneapolis Center"), said to a screen reader. */
  name?: string;
  /** The name shown before the figure, in the text's colour: "Departure
   *  124.35" in a clearance, where a row's title names it elsewhere. */
  named?: boolean;
  testId?: string;
}) {
  const text = typeof mhz === "number" ? mhzText(mhz) : mhz;
  const [copied, setCopied] = useCopied();
  const shown = copied === text;
  const button = (
    <BaseButton
      className="relative inline-flex items-center gap-1 font-semibold text-tint tabular-nums after:absolute after:-inset-x-2 after:-inset-y-3"
      aria-label={`${shown ? "Copied" : "Copy"} ${name ? `${name} ` : ""}${text}`}
      data-testid={testId}
      onClick={(event) => {
        // The frequency's own tap, not the row's or the card's under it.
        event.stopPropagation();
        // Called in the tap, as the clipboard asks.
        void navigator.clipboard?.writeText(text).then(
          () => setCopied(text),
          () => showError("Not Copied", "This browser would not let the frequency be copied."),
        );
      }}
    >
      {shown && <Check className="size-4" aria-hidden="true" />}
      {shown ? "Copied" : text}
    </BaseButton>
  );
  return named && name ? (
    <>
      {name} {button}
    </>
  ) : (
    button
  );
}
