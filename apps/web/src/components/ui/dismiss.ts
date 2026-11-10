/**
 * What a press outside a dialog, a sheet or a popover is not: Base UI
 * hears it as a close (`onOpenChange(false)`, reason "outside-press"),
 * and these keep it open by cancelling that close.
 */
interface CloseDetails {
  reason: string;
  event: Event;
  cancel: () => void;
}

/** True, and the close cancelled, when the press that would close it
 *  landed in one of `places`. */
export function keepOpenOn(details: CloseDetails, places: string): boolean {
  if (details.reason !== "outside-press") return false;
  const at = details.event.target;
  if (!(at instanceof Element) || !at.closest(places)) return false;
  details.cancel();
  return true;
}

/** A toast is not "outside" in the sense a sheet means. The toasts' stack is
 *  outside the sheet's tree, and the outside-press listener is on the
 *  document: tapping a toast's close button closed the drawer instead of
 *  the toast. On a phone that is the whole briefing disappearing because a
 *  pilot tried to dismiss a weather warning sitting on top of it. Toasts
 *  sit above every sheet by design, so a tap on one was always meant
 *  for it. */
export const TOAST = "[data-slot=toast-viewport]";
