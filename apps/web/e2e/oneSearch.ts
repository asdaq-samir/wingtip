import { expect, type Page } from "@playwright/test";
import { grabberTo, openPanel, settled, sheetUpToType, showTabs, sideDrawer, slow } from "./helpers";

/**
 * The one search's ways round the sheet (the owner's one-search design,
 * 2026-11-09), where the specs picked the FPL, Airport and Airplane tabs:
 * the plan, the search's own page, the traffic, and the search's rows.
 */

/** The sheet's first row (OneSearchField): the one search with the
 *  microphone and the page toggle (or Cancel) beside it, its role
 *  "search", where the tab bar was. */
export const firstRow = (page: Page) =>
  sideDrawer(page)
    .getByRole("search")
    .filter({ has: page.getByTestId("search-airports") });

/** One of the sheet's two pages up, by the round toggle at the end of
 *  the sheet's first row (PageToggle; the owner, 2026-11-14): 0 Search,
 *  1 FPL. The toggle shows the page it goes to, so it is tapped only while
 *  it shows `at`. A card over the sheet covers the row: closed first by
 *  Escape, as a pilot closes it; and at FPL's pill, where the figures are
 *  in the row's place, the sheet raised to half. */
export async function showPage(page: Page, at: 0 | 1) {
  const pages = sideDrawer(page).getByTestId("sheet-pages");
  if ((await pages.count()) === 0 || (await pages.getAttribute("data-page")) === String(at)) return;
  const cards = page.locator("[data-sheet-card][data-open]");
  for (let open = await cards.count(); open > 0; open--) {
    await cards.last().focus();
    await page.keyboard.press("Escape");
    await expect(cards).toHaveCount(open - 1);
  }
  const toggle = page.getByTestId("sheet-page-toggle");
  if (!(await toggle.isVisible())) await grabberTo(page, "half");
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-shows", String(at === 0 ? 1 : 0));
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

/** The traffic on the map from the first load (the map settings' Traffic,
 *  kept), so the one search finds the airplanes it hears by callsign or
 *  address (useHeardHits): the traffic's own page, with its own search,
 *  went for the one search (the owner, 2026-11-14). Before the page is
 *  opened. */
export async function trafficOnMap(page: Page) {
  await page.addInitScript(() => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":0}');
    localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state: { ...kept.state, traffic: true } }));
  });
}

/** An airplane the map hears, typed in the one search: its row. */
export async function findAirplane(page: Page, typed: string, name = typed) {
  await showSearch(page);
  await page.getByTestId("search-airports").fill(typed);
  const row = sideDrawer(page).getByTestId("search-airplane").filter({ hasText: name }).first();
  await expect(row).toBeVisible({ timeout: slow(15_000) });
  return row;
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
