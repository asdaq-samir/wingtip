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
 *  opens from the route's ••• (Type the Route), Done folding it away. A
 *  new plan or half a route has it open already. */
export async function openRoute(page: Page) {
  const panel = sideDrawer(page);
  const timeline = panel.getByTestId("route-summary");
  const done = panel.getByTestId("route-done");
  await expect(timeline.or(done).first()).toBeVisible({ timeout: slow(30_000) });
  if (await done.isVisible()) return;
  await controlsInSight(page);
  await panel.getByTestId("share-route").locator("visible=true").first().click();
  await page.getByTestId("route-type-open").click();
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
 *  More's Clear route (the owner, 2026-11-11 and 2026-11-18). */
export async function clearTheRoute(page: Page) {
  await openPanel(page);
  await controlsInSight(page);
  const boxClear = sideDrawer(page).getByTestId("route-box-clear");
  if (await boxClear.isVisible()) return boxClear.click();
  await sideDrawer(page).getByTestId("share-route").locator("visible=true").first().click();
  await page.getByTestId("route-clear").click();
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

/** The suggested routes' chips, put out above the route by the first row's
 *  button (RoutesToggle) where they are not out already. */
export async function suggestedRoutes(page: Page): Promise<Locator> {
  const toggle = sideDrawer(page).getByTestId("routes-toggle");
  await expect(toggle).toBeVisible({ timeout: slow(30_000) });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  return sideDrawer(page).getByTestId("route-line");
}
