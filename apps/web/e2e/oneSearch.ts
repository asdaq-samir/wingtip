import { expect, type Page } from "@playwright/test";
import { openPanel, settled, sheetUpToType, showTabs, sideDrawer } from "./helpers";

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

/** One of the sheet's two pages up, by its tab in the tab bar under the
 *  sheet (SheetTabBar; the owner, 2026-11-13): 0 Search, 1 FPL. */
export async function showPage(page: Page, at: 0 | 1) {
  const tab = page.locator(`[data-page-tab="${at}"]`);
  if ((await tab.count()) === 0 || (await tab.getAttribute("aria-selected")) === "true") return;
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(sideDrawer(page).getByTestId("sheet-pages")).toHaveAttribute("data-page", String(at));
}

/** The plan in sight (FPL, the sheet's second page): its Cancel first
 *  where the field is in use, then FPL's tab. */
export async function showPlan(page: Page) {
  await showTabs(page);
  const cancel = page.getByTestId("one-search-cancel");
  if (await cancel.isVisible()) await cancel.click();
  await showPage(page, 1);
}

/** The one search's own page (nothing typed): the flight, Favorites,
 *  Recents, Nearest, Saved -- the Airport and Airplane tabs' lists that
 *  were -- by a tap on the field. */
export async function showSearch(page: Page) {
  await showTabs(page);
  await showPage(page, 0);
  await sheetUpToType(page);
  await page.getByTestId("search-airports").click();
  await expect(sideDrawer(page).getByTestId("search-home")).toBeVisible();
}

/** The traffic about (the Airplane tab's list that was): the one search's
 *  Do, Traffic Nearby. */
export async function showTraffic(page: Page) {
  await showTabs(page);
  await showPage(page, 0);
  await sheetUpToType(page);
  await page.getByTestId("search-airports").fill("traffic");
  await sideDrawer(page).getByTestId("search-do-traffic").click();
}

/** The plan's empty box, with no route, by FPL's tab: with
 *  no route the sheet opens on the search, whose Plan a Flight went
 *  (3eb6e1417). */
export async function planFromSearch(page: Page) {
  await showPage(page, 1);
}

/** The sheet half way on the plan's empty box, as a fresh load with no
 *  route had FPL's (the one search opens on its own page now). */
export async function emptyPlan(page: Page) {
  await openPanel(page);
  await settled(sideDrawer(page));
  await planFromSearch(page);
  await expect(sideDrawer(page).getByTestId("route-type")).toBeVisible();
}

/** What the one search found typed: its airports' rows (OneSearchResults),
 *  the top hit first and the Airports group after it, apart from its
 *  waypoints, airplanes and Do. */
export const searchAirports = (page: Page) =>
  sideDrawer(page)
    .getByRole("group", { name: /^(Top Hit|Airports)$/ })
    .getByTestId("airport-result");

/** The account's home base kept to this page. Signed in, Home is the
 *  account's (lib/homeAirport, PUT /api/me/contact) and the suite shares
 *  one account: a spec that sets Home -- from Favorites, or a link's
 *  `home=` -- would otherwise set it for every spec after it (Fly Here
 *  then flew from it). The account's own answer, its home base `home`
 *  (none by default) at first, and what the page writes kept here. */
export async function ownHomeBase(page: Page, home: string | null = null) {
  let me: Record<string, unknown> | null = null;
  await page.route(
    (url) => url.pathname === "/api/me",
    async (route) => {
      const answer = await route.fetch();
      me ??= { ...((await answer.json()) as Record<string, unknown>), homeBase: home };
      await route.fulfill({ response: answer, json: me });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/me/contact",
    async (route) => {
      const { homeBase } = route.request().postDataJSON() as { homeBase: string };
      me = { ...me, homeBase: homeBase.trim().toUpperCase() || null };
      await route.fulfill({ json: me });
    },
  );
}
