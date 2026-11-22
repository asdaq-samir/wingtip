/**
 * Something sent from the app -- a route's address, the flight for the
 * passengers -- the one way it goes everywhere: the share sheet where the
 * browser has one (Safari on an iPhone), otherwise copied. Says which, for the page to say so.
 */
export async function shareOrCopy(item: { title: string; text?: string; url?: string }): Promise<"shared" | "copied"> {
  if (navigator.share) {
    await navigator.share(item);
    return "shared";
  }
  await copyText(item.url ?? item.text ?? "");
  return "copied";
}

/** Text copied, where a control says Copy rather than Share (a flight
 *  plan's form for Flight Service's own site, a frequency, a point's
 *  place): the one place the app writes to the clipboard. A browser with
 *  no clipboard to write to (a page not served over HTTPS) refuses, as one
 *  that says no does, so each Copy says so the same way. Copied, it is
 *  said by lib/doneNote's `done("Copied")`, Base UI's anchored toast by
 *  the control, the app's one confirmation (the owner's pick, 2026-11-21). */
export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard) throw new Error("No clipboard to copy to.");
  await navigator.clipboard.writeText(text);
}

/** The pilot closed the share sheet: nothing went wrong. */
export const cancelled = (err: unknown) => (err as Error | undefined)?.name === "AbortError";
