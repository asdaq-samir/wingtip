import { test, expect } from "@playwright/test";
import {
  airportSearch,
  consolePage,
  emptyPlan,
  firstRow,
  grabberTo,
  searchAirports,
  settle,
  sheetUpToType,
  showSearch,
  showTabs,
  sideDrawer,
  slow,
} from "./helpers";
import { stopsAre } from "./stopsParam";
import { showPage } from "./oneSearch";

/**
 * The one search (the owner's approved design, 2026-11-09), where the FPL,
 * Airport, Airplane and Setup tabs were: the sheet's first row one field,
 * "Search airports, airplanes, or ask", the microphone its trailing
 * button, the account button at the row's end -- no title row over it,
 * taken out for the map's room (the owner, 2026-11-10); nothing typed, the search's own page (the flight,
 * Favorites, Recents, Nearest); typed, one list in groups -- Airports,
 * Waypoints and Navaids, Airplanes, Do -- and Search Nearby; an airport picked,
 * its card with Fly Here, Add Stop, Call and Favorite at its top (the
 * owner, 2026-11-11), the first two setting the plan and showing it; the account button's menu, Setup's
 * rows. The plan is the sheet's main content with a route.
 */

test(
  "the account button at the one search's end, no title row over it; typed, its results come in groups, and an airport's card's Add Stop sets the plan",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    // With a route the sheet opens on FPL, the plan; the one search is its
    // other page, by the toggle riding the sheet's top (PageToggle, the
    // owner's 2026-11-13), with no tabs.
    await grabberTo(page, "half");
    await showPage(page, 0);
    const row = firstRow(page);
    // Short in sight, so it fits beside the mic and Cancel at larger text;
    // the whole sentence its name (the sheet audit's F-S2).
    await expect(row.getByTestId("search-airports")).toHaveAttribute("placeholder", "Search airports and airplanes");
    await expect(row.getByTestId("search-airports")).toHaveAttribute("aria-label", "Search airports and airplanes");
    await expect(row.getByTestId("account-button")).toBeVisible();
    await expect(sideDrawer(page).getByTestId("sheet-title")).toHaveCount(0);
    await expect(sideDrawer(page).getByRole("tablist", { name: "Tabs" })).toHaveCount(0);
    await expect(sideDrawer(page).getByLabel(/^(\S+, )?Departure$/)).toContainText("C81");

    // Focused: the search's own page, its home list (Favorites, Recents),
    // with no flight on it since the saved flights went to FPL (3eb6e1417),
    // Cancel beside the field in the account button's place, as iOS's
    // search fields have it.
    const search = await airportSearch(page);
    await search.click();
    const home = sideDrawer(page).getByTestId("search-home");
    await expect(home).toBeVisible();
    await expect(home.getByTestId("flight-summary-route")).toHaveCount(0);
    await expect(home.getByTestId("pill-section-favorites")).toBeVisible();
    await expect(row.getByTestId("one-search-cancel")).toBeVisible();
    await expect(row.getByTestId("account-button")).toHaveCount(0);

    // Typed: one list, grouped as Apple Maps' results are (the owner's
    // screenshot, 2026-11-10): the top hit with its quick actions, then the
    // words sent round a place as a suggestion.
    await search.fill("osh");
    const results = sideDrawer(page).getByTestId("one-search-results");
    await expect(searchAirports(page).filter({ hasText: "KOSH" }).first()).toBeVisible({ timeout: slow(10_000) });
    const top = results.getByRole("group", { name: "Top Hit" });
    await expect(top.getByTestId("search-top-fly-here")).toBeVisible();
    await expect(top.getByTestId("search-top-depart-from")).toBeVisible();
    await expect(results.getByRole("group", { name: "Suggestions" }).getByTestId("search-do-nearby")).toContainText("Search Nearby");

    // KOSH picked: its card, its four actions at its top and no others.
    await searchAirports(page).filter({ hasText: "KOSH" }).first().click();
    const card = sideDrawer(page).getByTestId("place-card");
    await expect(card.getByTestId("place-name")).toHaveText("KOSH", { timeout: slow(10_000) });
    for (const id of ["fly-here", "place-add-stop", "place-call", "place-favorite"]) await expect(card.getByTestId(id)).toBeVisible();
    await expect(card.getByTestId("place-actions").locator(":scope > *")).toHaveCount(4);
    await expect(card.getByTestId("place-add-stop")).toContainText("Add Stop");

    // Add Stop: KOSH a landing on the way, both ends kept.
    await card.getByTestId("place-add-stop").click();
    await expect(page).toHaveURL(stopsAre("KOSH"));
    await expect(page).toHaveURL(/[?&]dep=C81(&|$)/);
    await expect(page).toHaveURL(/[?&]dest=KDLH(&|$)/);
    // The plan up (FPL, the sheet's second page), and the search, its own
    // page now (its toggle, PageToggle), let go: back on it, the account
    // button in Cancel's place.
    await expect(sideDrawer(page).getByTestId("sheet-pages")).toHaveAttribute("data-page", "1");
    await showPage(page, 0);
    await expect(row.getByTestId("account-button")).toBeVisible();
  },
);

test("with no route the sheet opens on the search's own page, and the plan's empty box is FPL's", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  const home = sideDrawer(page).getByTestId("search-home");
  await expect(home).toBeVisible();
  // No Plan a Flight on the search's page (3eb6e1417, the owner: "We can
  // remove plan button and saved from search"): the plan is FPL's page.
  await expect(home.getByTestId("flight-summary-new")).toHaveCount(0);
  await emptyPlan(page);
  // FPL's page up: the search's kept behind its toggle (PageToggle), out of sight.
  await expect(sideDrawer(page).getByTestId("sheet-pages")).toHaveAttribute("data-page", "1");
  await expect(home).not.toBeInViewport();
});

test("the account button opens the account page itself, no menu first, and its close puts it away", async ({ page }) => {
  // The owner, 2026-11-10: "When tapping the avatar just open the settings".
  await page.goto("/app/plan");
  await settle(page);
  await showTabs(page);
  await page.getByTestId("account-button").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  const account = page.getByTestId("console-sheet");
  await expect(account.getByTestId("setup-page")).toBeVisible();
  // Half way as every card opens (e7bb15ec8): About, at Settings' foot, is
  // under its edge, reached by pulling the card up.
  await grabberTo(page, "full");
  await consolePage(account, "About");
  await expect(page.getByTestId("about-build")).toBeVisible();
  // One ✕ in sight on a page: its own, back to Settings; then Settings' own.
  await expect(account.getByTestId("console-close")).toBeHidden();
  await account.getByTestId("console-page-close").click();
  await account.getByTestId("console-close").click();
  await expect(account).toHaveCount(0);
  // Its button at the search's end, which comes back as the sheet comes down.
  await grabberTo(page, "half");
  await expect(page.getByTestId("account-button")).toBeVisible();
});

test("the search's Do runs a screen by its name, and Show Traffic", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await showSearch(page);
  const search = page.getByTestId("search-airports");
  await search.fill("logb");
  await sideDrawer(page).getByTestId("search-do-screen-logbook").click();
  await expect(page.getByTestId("console-sheet")).toBeVisible();
  // Opened from the search, its one ✕ goes back there in one tap.
  await page.getByTestId("console-page-close").click();
  await expect(page.getByTestId("console-sheet")).toHaveCount(0);
  await search.fill("traffic");
  await sideDrawer(page).getByTestId("search-do-traffic").click();
  // The traffic on the map, and no page of its own with a second field
  // (the owner, 2026-11-14): the one search finds the airplanes it hears.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("wingtip.preferences") ?? "{}").state?.traffic)).toBe(true);
  await expect(page).not.toHaveURL(/[?&]aircraft=1/);
  await expect(sideDrawer(page).getByRole("search")).toHaveCount(1);
  // On, it is not offered again.
  await search.fill("traffic");
  await expect(sideDrawer(page).getByTestId("search-do-traffic")).toHaveCount(0);
});

test("⌘K or Ctrl K focuses the one search from anywhere on a desktop", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "a desktop's keys");
  await page.goto("/app/plan");
  await settle(page);
  await page.locator("body").click({ position: { x: 1000, y: 400 } });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await expect(page.getByTestId("search-airports")).toBeFocused();
});

test("the top hit's Fly Here plans the route to it from the result, with no card between", async ({ page }) => {
  await page.goto("/app/plan?dep=C81");
  await settle(page);
  const search = await airportSearch(page);
  await sheetUpToType(page); // typing leaves the sheet where it is (5db1f8b10)
  await search.fill("KDLH");
  const top = sideDrawer(page).getByTestId("one-search-results").getByRole("group", { name: "Top Hit" });
  await expect(top.getByTestId("airport-result")).toContainText("KDLH", { timeout: slow(10_000) });
  await top.getByTestId("search-top-fly-here").click();
  await expect(page).toHaveURL(/[?&]dest=KDLH(&|$)/);
  await expect(sideDrawer(page).getByTestId("place-card")).toHaveCount(0);
});

test("focused and typed in, the search leaves the sheet at its size; the suggestions scroll under the search row, the field kept focused", async ({
  page,
}) => {
  // No title row to scroll away any more (the owner, 2026-11-10): the
  // search alone at the top, the list under it. Neither the focus nor
  // what is typed moves the sheet (the owner, 2026-11-11: "Whenever I try
  // to type on search bar it takes the card to full screen"): the
  // keyboard sits over the page as the Drawer places it.
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan");
  await settle(page);
  // Half way, where a pilot reads the results: at the pill they are under
  // its edge, and typing leaves the sheet where it is.
  await grabberTo(page, "half");
  const size = await sideDrawer(page).getAttribute("data-panel");
  expect(size).toBe("half");
  const search = await airportSearch(page);
  await search.click();
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", size!);
  await search.fill("a");
  await expect(searchAirports(page).first()).toBeVisible({ timeout: slow(10_000) });
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", size!);
  // All the way up by the grabber's keys (helpers' grabberTo focuses it),
  // then the field focused again, as the finger that dragged it up types on.
  await grabberTo(page, "full");
  await search.focus();
  const scroll = (top: number) =>
    page.getByTestId("one-search-results").evaluate((el, y) => {
      let at: HTMLElement | null = el;
      while (at && !(getComputedStyle(at).overflowY === "auto" && at.scrollHeight > at.clientHeight)) at = at.parentElement;
      at?.scrollTo({ top: y });
    }, top);
  await scroll(400);
  await expect(search).toBeInViewport();
  await expect(search).toBeFocused();
});
