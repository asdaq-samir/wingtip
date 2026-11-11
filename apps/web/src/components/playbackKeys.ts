import type { KeyboardEvent } from "react";

/** What a key does on a playback bar, where its own control has not used
 *  it: Space plays or pauses (Windy's and the GFA's), from the scrubber
 *  or the bar itself. On a button Space is the button's own press, and in
 *  a menu the menu's, so those are left alone. */
export function playbackKey(key: string, target: EventTarget | null): "toggle" | null {
  if (key !== " ") return null;
  if (
    target instanceof Element &&
    target.closest("button, a, textarea, input:not([type='range']), [role='menuitem'], [role='menuitemradio']")
  )
    return null;
  return "toggle";
}

/** The keys the scrubber's own (the APG slider's arrows, Home and End),
 *  kept from the toolbar round it, whose roving focus would take the same
 *  arrows to its next button: put round the slider (onKeyDown). */
export function keepSliderKeys(event: KeyboardEvent<HTMLElement>) {
  if (SLIDER_KEYS.has(event.key)) event.stopPropagation();
}
const SLIDER_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
