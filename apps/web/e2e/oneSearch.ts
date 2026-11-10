import { expect, type Page } from "@playwright/test";
import { openPanel, settled, showTabs, sideDrawer } from "./helpers";

/**
 * The one search's ways round the sheet (the owner's one-search design,
 * 2026-11-09), where the specs picked the FPL, Airport and Airplane tabs:
 * the plan, the search's own page, the traffic, and the search's rows.
 */

/** The sheet's first row (OneSearchField): the one search with the
 *  microphone and the account button (or Cancel) beside it, its role
 *  "search", where the tab bar was. */
export const firstRow = (page: Page) =>
  sideDrawer(page)
    .getByRole("search")
    .filter({ has: page.getByTestId("search-airports") });

/** The plan in sight under the one search (the sheet's main content with a
 *  route): the search's Your Flight card tapped where the search's own
 *  page is up, or its Cancel where the field is in use. */
export async function showPlan(page: Page) {
  await showTabs(page);
  const cancel = page.getByTestId("one-search-cancel");
  if (await cancel.isVisible()) await cancel.click();
  const card = sideDrawer(page).getByTestId("flight-summary").or(sideDrawer(page).getByTestId("flight-summary-new"));
  if (await card.isVisible()) await card.click();
}

/** The one search's own page (nothing typed): the flight, Favorites,
 *  Recents, Nearest, Saved -- the Airport and Airplane tabs' lists that
 *  were -- by a tap on the field. */
export async function showSearch(page: Page) {
  await showTabs(page);
  await page.getByTestId("search-airports").click();
  await expect(sideDrawer(page).getByTestId("search-home")).toBeVisible();
}

/** The traffic about (the Airplane tab's list that was): the one search's
 *  Do, Traffic Nearby. */
export async function showTraffic(page: Page) {
  await showTabs(page);
  await page.getByTestId("search-airports").fill("traffic");
  await sideDrawer(page).getByTestId("search-do-traffic").click();
}

/** The plan's empty box, with no route, from the one search's own page
 *  (its Plan a Flight): with no route the sheet opens on the search. */
export async function planFromSearch(page: Page) {
  const start = sideDrawer(page).getByTestId("flight-summary-new");
  if (await start.isVisible()) await start.click();
}

/** The sheet half way on the plan's empty box, as a fresh load with no
 *  route had FPL's (the one search opens on its own page now). */
export async function emptyPlan(page: Page) {
  await openPanel(page);
  await settled(sideDrawer(page));
  await planFromSearch(page);
  await expect(sideDrawer(page).getByTestId("route-type")).toBeVisible();
}

/** What the one search found typed: its Airports group's rows
 *  (OneSearchResults), apart from its waypoints, airplanes and Do. */
export const searchAirports = (page: Page) => sideDrawer(page).getByRole("group", { name: "Airports" }).getByTestId("airport-result");
