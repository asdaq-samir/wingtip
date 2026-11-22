import { expect, type Locator, type Page } from "@playwright/test";
import { planFromSearch } from "./oneSearch";
import { closeCard, grabberTo, openPanel, settled, sideDrawer, slow } from "./sheetHelpers";

/**
 * The route in the map's sheet: its field and FPL's timeline, its
 * controls brought into sight, the Brief over it put away, the suggested
 * routes' chips. The sheet's own moves are sheetHelpers'.
 */

/** FPL's route's field open over its timeline (the one layout, decision
 *  0047): the timeline is where the route is edited -- a tap on a field's
 *  line opens its runways and procedures, the mark is its menu, a hold or
 *  the grip moves it -- and the route's field, to type or paste it in,
 *  opens from Add a Stop's keyboard button (Type the route), Done folding it away. A
 *  new plan or half a route has it open already. */
export async function openRoute(page: Page) {
  const panel = sideDrawer(page);
  const timeline = panel.getByTestId("route-summary");
  const done = panel.getByTestId("route-done");
  await expect(timeline.or(done).first()).toBeVisible({ timeout: slow(30_000) });
  if (await done.isVisible()) return;
  await controlsInSight(page);
  await panel.getByTestId("route-type-open").click();
  await expect(done).toBeVisible();
}

/** The route's field folded away by its Done, where it is open (a route
 *  typed in), the timeline alone. */
export async function foldRoute(page: Page) {
  const done = sideDrawer(page).getByTestId("route-done");
  if (await done.isVisible()) await done.click();
  await expect(sideDrawer(page).getByTestId("route-summary")).toBeVisible();
}

/** A point's line on FPL's timeline, by its ident. */
export function timelineLine(page: Page, ident: string): Locator {
  return sideDrawer(page).locator(`[data-testid="timeline-line"][data-ident="${ident}"]`);
}

/** The route cleared: half a route by the route box's ✕, a route by
 *  FPL's ✕ (the owner, 2026-11-11, 2026-11-18 and 2026-11-21). */
export async function clearTheRoute(page: Page) {
  await openPanel(page);
  await controlsInSight(page);
  const boxClear = sideDrawer(page).getByTestId("route-box-clear");
  if (await boxClear.isVisible()) return boxClear.click();
  await sideDrawer(page).getByTestId("fpl-clear").click();
  // FPL's ✕ asks first (ClearRouteButton).
  await page.getByRole("alertdialog").getByRole("button", { name: "Clear Route" }).click();
}

/** The Brief put away, by its own close (closeCard), which goes back
 *  one at a time: from a page to the
 *  Brief's cards (BriefGlance), then FPL's route and nav log again. */
export async function closeBrief(page: Page) {
  const card = sideDrawer(page).getByTestId("brief-card");
  if (!(await card.isVisible().catch(() => false))) return;
  if (!(await card.getByTestId("brief-glance").isVisible())) {
    await closeCard(page, "brief-close");
    await expect(card.getByTestId("brief-glance")).toBeVisible();
  }
  await closeCard(page, "brief-close");
  await expect(card).toHaveCount(0);
}

/** The route's controls in sight -- its box, the airplane, the time,
 *  Share -- all the way up, where the pill has them too (MapPanel), with
 *  room for what a chip opens. */
export async function controlsInSight(page: Page) {
  const panel = sideDrawer(page);
  await panel.waitFor();
  // The Brief, a card over FPL, has them out of sight: put away.
  await closeBrief(page);
  await grabberTo(page, "full");
  await settled(panel);
  // With no route the search's page is up: Plan a Flight, the empty box.
  await planFromSearch(page);
}

/** Route Options, the Routes tab of FPL's floating bar (FplTabBar; the
 *  owner, 2026-11-22: "route option can show in the tab bar"), which says
 *  whether the suggested routes are out (aria-pressed). */
export async function routeOptionsItem(page: Page): Promise<Locator> {
  return sideDrawer(page).getByTestId("routes-toggle");
}

/** The suggested routes' chips, put out above the route by the bar's
 *  Routes where they are not out already. */
export async function suggestedRoutes(page: Page): Promise<Locator> {
  await expect(async () => {
    const item = await routeOptionsItem(page);
    await expect(item).toBeVisible({ timeout: 2000 });
    if ((await item.getAttribute("aria-pressed")) !== "true") await item.click();
    await expect(item).toHaveAttribute("aria-pressed", "true", { timeout: 2000 });
  }).toPass({ timeout: slow(30_000) });
  return sideDrawer(page).getByTestId("route-line");
}
