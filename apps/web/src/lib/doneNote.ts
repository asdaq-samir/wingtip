import { toast } from "./toast";

/**
 * A confirmation said where it happened: "Flight Saved" by the Save the
 * pilot tapped, not in a banner across the top of the screen (CLAUDE.md;
 * lib/problems for the errors). Base UI's anchored toast (lib/toast's
 * `done`), by the control that has the focus -- the one just tapped -- or
 * the one passed, for two seconds, said to a screen reader as every toast
 * is.
 */
export function done(words: string, options: { detail?: string; near?: Element | null } = {}): void {
  if (typeof document === "undefined") return;
  toast.done(words, options);
}
