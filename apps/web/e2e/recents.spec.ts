import { test, expect, type Page } from "@playwright/test";
import { airportSearch, clearTheRoute, grabberTo, inSheet, settle, sideDrawer, stripShows } from "./helpers";
import { showPage } from "./sheetPages";

/**
 * The Recents taken off one at a time, from each row's menu -- its ••• or
 * a long press, the stock menus (RemovableRow, the owner, 2026-11-10,
 * where a swipe uncovered a Delete) -- or all at once by Clear, at the
 * pilot's ask ("I should be able to clear recents or delete individual
 * ones") -- the airports' under the search bar, the
 * airplanes' on the Aircraft card and the routes' in FPL. Each tab's strip
 * shows them as tiles from its filter, headed as the Favorites are, the
 * title the way to the rest and Clear, at the owner's asks ("Can we have
 * recents under saved ?", "make saved, favorites and recents into links,
 * when clicked shows what See All does", "apply the filter to other cards
 * too").
 */

/** A kept airport: where it is too, for its picture card (RecentCards). */
type Kept = { ident: string; name: string; municipality: string; lat?: number; lon?: number };
const AIRPORTS: Kept[] = [
  { ident: "KDLH", name: "Duluth International Airport", municipality: "Duluth" },
  { ident: "KMSP", name: "Minneapolis-St Paul International Airport", municipality: "Minneapolis" },
  { ident: "C81", name: "Campbell Airport", municipality: "Grayslake" },
];
const AIRCRAFT = [
  { hex: "a0b7d8", name: "N14511", type: "B39M" },
  { hex: "a1c2d3", name: "N200XY", type: "C172" },
];

async function seed(page: Page, recentAirports = AIRPORTS, recentRoutes: unknown[] = []) {
  await page.addInitScript(
    ({ recentAirports, recentAircraft, recentRoutes }) => {
      // Once: a reload keeps what the test took off.
      if (sessionStorage.getItem("recents-seeded")) return;
      sessionStorage.setItem("recents-seeded", "1");
      localStorage.setItem("wingtip.preferences", JSON.stringify({ state: { recentAirports, recentAircraft, recentRoutes }, version: 0 }));
    },
    { recentAirports, recentAircraft: AIRCRAFT, recentRoutes },
  );
}

/** The question's own Clear: the list's Clear has the same name, and a
 *  click on the last of them before the question was up took the list's. */
async function confirmClear(page: Page) {
  await page.getByRole("alertdialog").getByRole("button", { name: "Clear", exact: true }).click();
}

/** The airports' Recents in full, all the way up: the list their title
 *  opens, where they are taken off (tiles on the one search's own page). */
async function airportRecentsList(page: Page) {
  await airportSearch(page);
  await grabberTo(page, "full");
  // The Recents a section of the one search's own page (no filter).
  await expect(sideDrawer(page).getByTestId("search-home")).toBeVisible();
  await sideDrawer(page).getByTestId("airport-recents-more").click();
  await expect(sideDrawer(page).getByTestId("airport-recents-page")).toBeVisible();
}

test("a row's ••• takes an airport off the Recents, and Clear takes them all", async ({ page }) => {
  await seed(page);
  await page.goto("/app/plan");
  await settle(page);
  await airportRecentsList(page);
  const panel = sideDrawer(page);
  const recents = panel.getByTestId("airport-recent");
  await expect(recents).toHaveCount(3);

  // Each row's •••, named for the row, opens Share and Remove.
  const more = panel.getByTestId("row-more");
  await expect(more.first()).toHaveAccessibleName("More for KDLH");
  await more.first().click();
  await expect(page.getByRole("menuitem")).toHaveText(["Share", "Remove"]);
  await page.getByTestId("row-remove").click();
  await expect(recents).toHaveCount(2);
  await expect(recents.first()).toContainText("KMSP");
  // Kept so: a reload still has two.
  await page.reload();
  await settle(page);
  await airportRecentsList(page);
  await expect(recents).toHaveCount(2);

  // The keyboard's way: the ••• is in the tab order; Enter opens its menu.
  await more.first().focus();
  await page.keyboard.press("Enter");
  await page.getByTestId("row-remove").focus();
  await page.keyboard.press("Enter");
  await expect(recents).toHaveCount(1);

  // Clear, asked first: the stock centred alert at every width, never a
  // sheet from the foot (the owner, 2026-11-20), its Cancel with the focus,
  // so Enter never clears unasked. Either way out keeps the Recents.
  await panel.getByTestId("recents-clear").click();
  const ask = page.getByRole("alertdialog", { name: "Clear the Recents?" });
  await expect(ask).toBeVisible();
  const out = ask.getByRole("button", { name: "Cancel", exact: true });
  await expect(out).toBeFocused();
  await expect(ask).toHaveAttribute("data-slot", "alert-dialog-content");
  await out.click();
  await expect(ask).toHaveCount(0);
  await expect(recents).toHaveCount(1);
  await panel.getByTestId("recents-clear").click();
  await confirmClear(page);
  await expect(recents).toHaveCount(0);
});

test("the airports' Recents are picture cards of their chart, newest first, and their title lists them, Back to the search", async ({
  page,
}) => {
  await seed(page, [
    // Where it is kept, its card is the sectional round it (RecentCards).
    { ...AIRPORTS[0], lat: 46.8421, lon: -92.1936 },
    ...AIRPORTS.slice(1),
    { ident: "KMSN", name: "Dane County Regional Airport", municipality: "Madison" },
    { ident: "KOSH", name: "Wittman Regional Airport", municipality: "Oshkosh" },
  ]);
  await page.goto("/app/plan");
  await settle(page);
  await airportSearch(page);
  await grabberTo(page, "full");
  const panel = sideDrawer(page);
  // Picture cards sliding sideways, as Apple Maps on the web shows its
  // guides (the owner's screenshot, 2026-11-10, where they were tiles with
  // the chart's symbol): each the sectional's own tile round the field, at
  // zoom 10, its ident and name over the picture's foot.
  // The Recents a section of the one search's own page (no filter).
  await expect(sideDrawer(page).getByTestId("search-home")).toBeVisible();
  const section = panel.getByTestId("airport-recents");
  const tiles = section.getByTestId("airport-recent");
  await expect(tiles).toHaveCount(5);
  await expect(tiles.first()).toContainText("KDLH");
  await expect(tiles.first()).toContainText("Duluth");
  await expect(tiles.first().locator("img")).toHaveAttribute("src", /\/sec\/10\/\d+\/\d+/);
  // A tap opens the field's card, as a Favorite's does.
  await tiles.nth(2).click();
  await expect(page).toHaveURL(/[?&]place=C81/);
  await page.goto("/app/plan");
  await settle(page);
  await airportSearch(page);
  await grabberTo(page, "full");
  // The title, in the tint, as the Favorites' is: the list, where they are
  // taken off.
  // The Recents a section of the one search's own page (no filter).
  await expect(sideDrawer(page).getByTestId("search-home")).toBeVisible();
  const all = panel.getByTestId("airport-recents-more");
  await expect(all).toHaveText("Recents");
  await all.click();
  await expect(panel.getByTestId("airport-recents-page")).toBeVisible();
  // The five airports' rows, then the two airplanes' after them.
  await expect(panel.getByTestId("row-more")).toHaveCount(7);
  await panel.getByTestId("airport-recents-page-close").click();
  await expect(tiles).toHaveCount(5);
});

test("the airplanes' Recents follow the airports' on the search's page and in full: a long press offers the Delete too, and Clear takes them all", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/app/plan");
  await settle(page);
  await airportSearch(page);
  await grabberTo(page, "full");
  const panel = sideDrawer(page);
  // Tiles under the airports' in the one Recents (the traffic's own page,
  // with its own Recents, went for the one search, 2026-11-14); the
  // section's title the list in full, airports' and airplanes'.
  await expect(panel.getByTestId("airport-recents").getByTestId("pill-aircraft-recents").getByTestId("aircraft-recent")).toHaveCount(2);
  await panel.getByTestId("airport-recents-more").click();
  await expect(panel.getByTestId("airport-recents-page")).toBeVisible();
  const recents = panel.getByTestId("aircraft-recent");
  await expect(recents).toHaveCount(2);

  // A long press (a right click here) offers Share and Remove, as every
  // list's row does.
  await recents.first().click({ button: "right" });
  await expect(page.getByRole("menuitem")).toHaveText(["Share", "Remove"]);
  await page.getByTestId("row-remove").click();
  await expect(recents).toHaveCount(1);
  await expect(recents.first()).toContainText("N200XY");

  await panel.getByTestId("recents-clear").click();
  await confirmClear(page);
  await expect(recents).toHaveCount(0);
  await expect(panel.getByTestId("airport-recent")).toHaveCount(0);
});

test("FPL's strip shows Saved or, from its filter, the latest routes planned as tiles, their title the rest, a tap plans one again and it comes first", async ({
  page,
}) => {
  const day = (d: number) => Date.UTC(2026, 9, d, 15);
  await seed(page, AIRPORTS, [
    { dep: "C81", dest: "KDLH", stops: [], at: day(15) },
    { dep: "KRFD", dest: "KMKE", stops: [], at: day(14) },
    { dep: "C81", dest: "KMSP", stops: ["KLSE"], at: day(13) },
    { dep: "C81", dest: "KMSN", stops: [], at: day(12) },
  ]);
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  // FPL's strip, under its empty route: with no route the sheet opens on
  // Search, which no longer shows Saved (3eb6e1417), so FPL by its toggle.
  await showPage(page, 1);
  const panel = sideDrawer(page);
  // Saved first; the Recents from the strip's filter, as every tab's lists
  // are: each title the way to the list in full, in the tint.
  await expect(panel.getByTestId("pill-section-saved-more")).toHaveText("Saved");
  await expect(panel.getByTestId("route-recents")).toHaveCount(0);
  await stripShows(page, "fpl-strip-shows", "fpl-shows-recents");
  await expect(panel.getByTestId("route-recents-more")).toHaveText("Recents");
  // Tiles, as Saved's are: the route and the day, its stops said to a
  // screen reader.
  const section = panel.getByTestId("route-recents");
  await expect(section.getByTestId("route-recents-strip").getByTestId("route-recent")).toHaveCount(4);
  await expect(section.getByTestId("route-recent").first()).toContainText("C81→KDLH");
  await expect(section.getByTestId("route-recent").nth(2)).toHaveAccessibleName(/C81 to KMSP by KLSE/);

  // The rest, all the way up, and a tap on the oldest plans it again.
  await section.getByTestId("route-recents-more").click();
  await expect(panel.getByTestId("route-recents-page")).toBeVisible();
  // The page's rows: FPL's strip under it keeps its tiles, out of sight.
  const all = panel.getByTestId("route-recent").locator("visible=true");
  await expect(all).toHaveCount(4);
  await inSheet(page, all.last()); // the oldest, under a half sheet's edge
  await all.last().click();
  await expect(page).toHaveURL(/[?&]dep=C81&dest=KMSN/);
  // Kept first once the planner has answered it.
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("wingtip.preferences")!).state.recentRoutes[0]?.dest), {
      timeout: 30_000,
    })
    .toBe("KMSN");
  // Cleared from the route's box, the sheet out where the box is.
  await clearTheRoute(page);
  await expect(panel.getByTestId("route-recent").first()).toContainText("C81→KMSN");

  // Under their headings, as Maps' Recents are: KMSN planned just now
  // under Today, the rest under This Month or Earlier.
  await panel.getByTestId("route-recents-more").click();
  await expect(panel.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  // Its ••• offers Share and Remove; Remove takes that one off.
  await panel.getByTestId("route-recent-more").first().click();
  await expect(page.getByTestId("route-recent-share")).toBeVisible();
  await expect(page.getByRole("menuitem")).toHaveText(["Share", "Remove"]);
  await page.getByTestId("route-recent-remove").click();
  await expect(all).toHaveCount(3);
  // Clear at each heading's right, asked first, until none is left: the
  // strip says none yet then, and Saved is back from its filter.
  for (let left = await panel.getByTestId("route-recents-clear").count(); left > 0; left--) {
    await panel.getByTestId("route-recents-clear").first().click();
    await confirmClear(page);
    await expect(panel.getByTestId("route-recents-clear")).toHaveCount(left - 1);
  }
  await expect(panel.getByTestId("route-recent")).toHaveCount(0);
  // The page empty says so as the app's full lists do (EmptyState), as
  // Saved flights' page does.
  await expect(panel.getByText("No recent routes")).toBeVisible();
  await panel.getByTestId("route-recents-page-close").click();
  await expect(panel.getByTestId("route-recents")).toContainText("None yet");
  await stripShows(page, "fpl-strip-shows", "fpl-shows-saved");
  await expect(panel.getByTestId("pill-section-saved")).toBeVisible();
});

test("Saved's title opens the flights in full with Back to FPL, as the Recents' does", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await showPage(page, 1); // Saved is FPL's, as above
  const panel = sideDrawer(page);
  await panel.getByTestId("pill-section-saved-more").click();
  await expect(page).toHaveURL(/[?&]saved=1/);
  await expect(panel.getByTestId("saved-page")).toContainText("Saved");
  await panel.getByTestId("saved-page-close").click();
  await expect(page).not.toHaveURL(/[?&]saved=/);
  await expect(panel.getByTestId("pill-section-saved")).toBeVisible();
});
