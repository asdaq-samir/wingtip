import type { PanelState } from "../../../lib/mapChrome";

/** The panel's size as of now (PlanWorkspace): one workspace is open at a
 *  time. A holder, not a ref, as the handlers that read it go out through
 *  the workspace's render prop, and the workspace's hooks read it alike.
 *  Read when tapped, not a dependency, so a turn of the sheet does not
 *  make every handler new (usePlanWorkspace). */
export const panelNow: { current: PanelState } = { current: "peek" };

/**
 * The one size the app gives the sheet, Apple Maps' rule (the owner,
 * 2026-11-11: "I like the stock behavior"): something new opened while
 * the sheet is at its smallest size, the pill, rises to half so it can be
 * seen. Otherwise the sheet keeps the size the pilot left it at -- the app
 * never lowers it and never takes it to full. Cards size their own
 * drawers (lib/sheetCards' `opens`, the card rule).
 */
export function risenToSee(now: PanelState): PanelState | null {
  return now === "peek" ? "half" : null;
}

/** risenToSee, applied to the sheet as it is now. */
export function riseToSee(setPanel: (next: PanelState) => void) {
  const next = risenToSee(panelNow.current);
  if (next) setPanel(next);
}
