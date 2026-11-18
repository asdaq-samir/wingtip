import type { PanelState } from "../../lib/mapChrome";

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
 * never lowers it, and takes it to full only for the route the pilot just
 * made longer (risenForFigures). Cards size their own
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

/** How long after the pilot's own edit of the route its growth is theirs:
 *  the timeline's new row is drawn as the address changes, the plan's
 *  figures within a second or two. */
const EDIT_MS = 5000;

/** When the pilot last edited the route (a stop added, moved or changed),
 *  for riseForFigures; forgotten as the pilot moves the
 *  sheet themselves. A holder, as panelNow is. */
const routeEdit: { at: number } = { at: -Infinity };

/** The pilot edited the route just now (useRouteEdits, a point dropped in). */
export function markRouteEdit() {
  routeEdit.at = performance.now();
}

/** The pilot moved the sheet: what grows next is not theirs to see raised. */
export function forgetRouteEdit() {
  routeEdit.at = -Infinity;
}

/**
 * The one other size the app gives the sheet (the owner, 2026-11-18,
 * "figures disappear" when a stop was added): at half, a route the pilot
 * just made longer -- a stop added -- that pushes
 * FPL's figures under the actions' floating bar at rest goes all the way
 * up, where the route and its figures are both in sight. Never on a load or
 * a link (no edit), never once the pilot has moved the sheet since, and
 * only from half: at the pill the figures are the pill, all the way up
 * there is room.
 */
export function risenForFigures(now: PanelState, sinceEdit: number): PanelState | null {
  return now === "half" && sinceEdit >= 0 && sinceEdit < EDIT_MS ? "full" : null;
}

/** risenForFigures, applied to the sheet as it is now; the edit used up once it has raised it. */
export function riseForFigures(setPanel: (next: PanelState) => void) {
  const next = risenForFigures(panelNow.current, performance.now() - routeEdit.at);
  if (!next) return;
  forgetRouteEdit();
  setPanel(next);
}
