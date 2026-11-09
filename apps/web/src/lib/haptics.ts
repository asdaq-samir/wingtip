import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./motion";
import { HAPTIC } from "./tokens";

/** A key action a pilot feels as well as sees (design/tokens.json's haptic group). */
type HapticKind = keyof typeof HAPTIC;

/**
 * The tap felt on a key action -- an altitude set, Direct To, a warning
 * shown, the sheet settling at a detent -- as the phones' apps give it
 * (iOS's sensory feedback, Android's HapticFeedbackConstants): here
 * navigator.vibrate's pattern from the tokens, where the browser has one
 * (Chrome on Android; Safari has none, and nothing happens). None with
 * Reduce Motion, which the pilot asked for less of, as the phones do.
 */
export function feel(kind: HapticKind): void {
  if (prefersReducedMotion()) return;
  const vibrate = typeof navigator !== "undefined" ? navigator.vibrate : undefined;
  if (typeof vibrate !== "function") return;
  try {
    vibrate.call(navigator, [...HAPTIC[kind]]);
  } catch {
    // A page the pilot has not yet touched may not vibrate: nothing lost.
  }
}

/** Felt once as something new comes on the screen -- an alert ahead, the
 *  copilot's warning -- by its `key`; nothing while it stays, or for none. */
export function useFeelOnNew(key: string | null | undefined, kind: HapticKind): void {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (key && key !== last.current) feel(kind);
    last.current = key ?? null;
  }, [key, kind]);
}
