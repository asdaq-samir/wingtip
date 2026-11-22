/**
 * Whether the route the page opened on has drawn: its plan in, its figures
 * on screen, or no route asked for at all (the plan view model's
 * planSettled, usePlanWorkspace). What the page fetches ahead for a later
 * tap -- the pilot console, the search's own page, the airplanes' tiles,
 * the cards drawn at a tap -- waits for it, then its own moment, so none of
 * it shares a route's first seconds on a slow phone. Each had waited a
 * fixed time from the page's mount, and where the route took longer than
 * that they were fetched before it: CI's phone read 4,234,091 bytes of
 * scripts before the ETE (route-load.spec), and 3,605,492 once these
 * waited, at four and at sixteen times slower alike.
 *
 * Opened at the latest LATEST_MS after the page loads, so a plan that never
 * comes (the planner out of reach) does not keep them back for good.
 */
const LATEST_MS = 15_000;

let open: () => void = () => {};
const drawn = new Promise<void>((resolve) => {
  open = resolve;
  if (typeof window !== "undefined") window.setTimeout(resolve, LATEST_MS);
});

/** The route opened has drawn, or there is none (usePlanWorkspace). */
export function markRouteDrawn() {
  open();
}

/** `go` once the route has drawn and `ms` more have passed; the function
 *  it gives back calls it off, for an effect's cleanup. */
export function afterRouteDrawn(go: () => void, ms: number): () => void {
  let timer: number | undefined;
  let off = false;
  void drawn.then(() => {
    if (!off) timer = window.setTimeout(go, ms);
  });
  return () => {
    off = true;
    window.clearTimeout(timer);
  };
}
