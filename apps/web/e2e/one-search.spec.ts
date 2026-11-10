import { test, expect } from "@playwright/test";
import {
  airportSearch,
  consolePage,
  emptyPlan,
  firstRow,
  grabberTo,
  searchAirports,
  settle,
  showSearch,
  showTabs,
  sideDrawer,
  slow,
} from "./helpers";

/**
 * The one search (the owner's approved design, 2026-11-09), where the FPL,
 * Airport, Airplane and Setup tabs were: the sheet's first row one field,
 * "Search airports, airplanes, or ask", the microphone its trailing
 * button, and over it the title row, the app's name with the account
 * button at its right (the owner's Apple Maps screenshot, 2026-11-10); nothing typed, the search's own page (the flight,
 * Favorites, Recents, Nearest); typed, one list in groups -- Airports,
 * Waypoints and Navaids, Airplanes, Do -- and "Ask:"; an airport picked,
 * its card with Fly Here, Depart From and Add as Stop at its top, each
 * setting the plan and showing it; the account button's menu, Setup's
 * rows. The plan is the sheet's main content with a route.
 */

test(
  "the sheet's title row holds the account button over the one search; typed, its results come in groups, and an airport's Depart From sets the plan",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    // With a route the plan is the sheet's main content, the one search over
    // it, no tabs.
    await grabberTo(page, "half");
    const row = firstRow(page);
    const title = sideDrawer(page).getByTestId("sheet-title");
    await expect(row.getByTestId("search-airports")).toHaveAttribute("placeholder", "Search airports, airplanes, or ask");
    await expect(title.getByTestId("account-button")).toBeVisible();
    await expect(title.getByRole("heading", { name: "Wingtip Maps" })).toBeVisible();
    await expect(row.getByTestId("account-button")).toHaveCount(0);
    await expect(sideDrawer(page).getByRole("tablist", { name: "Tabs" })).toHaveCount(0);
    await expect(sideDrawer(page).getByLabel(/^(\S+, )?Departure$/)).toContainText("C81");

    // Focused: the search's own page, the flight first, Cancel beside the
    // field, the title row kept over it as Apple's is while typing.
    const search = await airportSearch(page);
    await search.click();
    const home = sideDrawer(page).getByTestId("search-home");
    await expect(home).toBeVisible();
    await expect(home.getByTestId("flight-summary-route")).toContainText("C81");
    await expect(home.getByTestId("pill-section-favorites")).toBeVisible();
    await expect(row.getByTestId("one-search-cancel")).toBeVisible();
    await expect(title.getByTestId("account-button")).toBeVisible();

    // Typed: one list, grouped as Apple Maps' results are (the owner's
    // screenshot, 2026-11-10): the top hit with its quick actions, then the
    // question for the assistant as a suggestion.
    await search.fill("osh");
    const results = sideDrawer(page).getByTestId("one-search-results");
    await expect(searchAirports(page).filter({ hasText: "KOSH" }).first()).toBeVisible({ timeout: slow(10_000) });
    const top = results.getByRole("group", { name: "Top Hit" });
    await expect(top.getByTestId("search-top-fly-here")).toBeVisible();
    await expect(top.getByTestId("search-top-depart-from")).toBeVisible();
    await expect(results.getByRole("group", { name: "Suggestions" }).getByTestId("search-do-ask")).toContainText("Ask: “osh”");

    // KOSH picked: its card, the plan's three actions at its top.
    await searchAirports(page).filter({ hasText: "KOSH" }).first().click();
    const card = sideDrawer(page).getByTestId("place-card");
    await expect(card.getByTestId("place-name")).toHaveText("KOSH", { timeout: slow(10_000) });
    for (const id of ["fly-here", "place-depart-from", "place-add-stop"]) await expect(card.getByTestId(id)).toBeVisible();
    await expect(card.getByTestId("place-add-stop")).toContainText("Add as Stop");

    // Depart From: KOSH the route's start, its destination kept, the plan up.
    await card.getByTestId("place-depart-from").click();
    await expect(page).toHaveURL(/[?&]dep=KOSH(&|$)/);
    await expect(page).toHaveURL(/[?&]dest=KDLH(&|$)/);
    await expect(card).toHaveCount(0);
    await expect(sideDrawer(page).getByLabel(/^(\S+, )?Departure$/)).toContainText("KOSH");
    await expect(title.getByTestId("account-button")).toBeVisible();
  },
);

test("with no route the sheet opens on the search's own page, and Plan a Flight is the plan's empty box", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  const home = sideDrawer(page).getByTestId("search-home");
  await expect(home).toBeVisible();
  await expect(home.getByTestId("flight-summary-new")).toHaveText(/Plan a Flight/);
  await emptyPlan(page);
  await expect(home).toBeHidden();
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
  await consolePage(account, "About");
  await expect(page.getByTestId("about-build")).toBeVisible();
  await account.getByTestId("console-close").click();
  await expect(account).toHaveCount(0);
  // Its button in the title row, which comes back as the sheet comes down.
  await grabberTo(page, "half");
  await expect(page.getByTestId("account-button")).toBeVisible();
});

test("the search's Do runs a screen by its name, and the Traffic Nearby", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await showSearch(page);
  const search = page.getByTestId("search-airports");
  await search.fill("logb");
  await sideDrawer(page).getByTestId("search-do-screen-logbook").click();
  await expect(page.getByTestId("console-sheet")).toBeVisible();
  await page.getByTestId("console-close").click();
  await search.fill("traffic");
  await sideDrawer(page).getByTestId("search-do-traffic").click();
  await expect(page).toHaveURL(/[?&]aircraft=1/);
  // One search field (the one card rule, 2026-11-10): the traffic's is the one search's, scoped, not a second.
  await expect(sideDrawer(page).getByTestId("aircraft-search")).toBeVisible();
  await expect(sideDrawer(page).getByRole("search")).toHaveCount(1);
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
  await search.fill("KDLH");
  const top = sideDrawer(page).getByTestId("one-search-results").getByRole("group", { name: "Top Hit" });
  await expect(top.getByTestId("airport-result")).toContainText("KDLH", { timeout: slow(10_000) });
  await top.getByTestId("search-top-fly-here").click();
  await expect(page).toHaveURL(/[?&]dest=KDLH(&|$)/);
  await expect(sideDrawer(page).getByTestId("place-card")).toHaveCount(0);
});

test("typed, the suggestions scroll the title and the field away with them, the field kept focused, and back at the top they return", async ({
  page,
}) => {
  // Apple Maps on the web, the owner's screenshot (2026-11-10): nothing pinned while typing.
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan");
  await settle(page);
  await showTabs(page);
  const search = await airportSearch(page);
  await search.click();
  await search.fill("a");
  await expect(searchAirports(page).first()).toBeVisible({ timeout: slow(10_000) });
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "full");
  const title = sideDrawer(page).getByTestId("sheet-title");
  await expect(title).toBeInViewport();
  // The list's own scroller, scrolled down past the head's height.
  const scroll = (top: number) =>
    page.getByTestId("one-search-results").evaluate((el, y) => {
      let at: HTMLElement | null = el;
      while (at && !(getComputedStyle(at).overflowY === "auto" && at.scrollHeight > at.clientHeight)) at = at.parentElement;
      at?.scrollTo({ top: y });
    }, top);
  await scroll(400);
  await expect(title).not.toBeInViewport();
  await expect(search).toBeFocused();
  await scroll(0);
  await expect(title).toBeInViewport();
  await expect(search).toBeFocused();
});
