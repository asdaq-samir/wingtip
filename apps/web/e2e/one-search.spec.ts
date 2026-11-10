import { test, expect } from "@playwright/test";
import { airportSearch, emptyPlan, firstRow, grabberTo, searchAirports, settle, showSearch, showTabs, sideDrawer, slow } from "./helpers";

/**
 * The one search (the owner's approved design, 2026-11-09), where the FPL,
 * Airport, Airplane and Setup tabs were: the sheet's first row one field,
 * "Search airports, airplanes, or ask", the microphone and the account
 * button beside it; nothing typed, the search's own page (the flight,
 * Favorites, Recents, Nearest); typed, one list in groups -- Airports,
 * Waypoints and Navaids, Airplanes, Do -- and "Ask:"; an airport picked,
 * its card with Fly Here, Depart From and Add as Stop at its top, each
 * setting the plan and showing it; the account button's menu, Setup's
 * rows. The plan is the sheet's main content with a route.
 */

test(
  "the sheet's first row is the one search and the account button; typed, its results come in groups, and an airport's Depart From sets the plan",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    // With a route the plan is the sheet's main content, the one search over
    // it, no tabs.
    await grabberTo(page, "half");
    const row = firstRow(page);
    await expect(row.getByTestId("search-airports")).toHaveAttribute("placeholder", "Search airports, airplanes, or ask");
    await expect(row.getByTestId("account-button")).toBeVisible();
    await expect(sideDrawer(page).getByRole("tablist", { name: "Tabs" })).toHaveCount(0);
    await expect(sideDrawer(page).getByLabel("Departure", { exact: true })).toContainText("C81");

    // Focused: the search's own page, the flight first, Cancel in the
    // account button's place.
    const search = await airportSearch(page);
    await search.click();
    const home = sideDrawer(page).getByTestId("search-home");
    await expect(home).toBeVisible();
    await expect(home.getByTestId("flight-summary-route")).toContainText("C81");
    await expect(home.getByTestId("pill-section-favorites")).toBeVisible();
    await expect(row.getByTestId("one-search-cancel")).toBeVisible();
    await expect(row.getByTestId("account-button")).toHaveCount(0);

    // Typed: one list, grouped, the assistant last.
    await search.fill("osh");
    const results = sideDrawer(page).getByTestId("one-search-results");
    await expect(searchAirports(page).filter({ hasText: "KOSH" }).first()).toBeVisible({ timeout: slow(10_000) });
    await expect(results.getByRole("group", { name: "Do" })).toBeVisible();
    await expect(results.getByTestId("search-do-ask")).toContainText("Ask: “osh”");

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
    await expect(sideDrawer(page).getByLabel("Departure", { exact: true })).toContainText("KOSH");
    await expect(row.getByTestId("account-button")).toBeVisible();
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

test("the account button's menu holds Setup's rows, opens the account page, and its close puts it away", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await showTabs(page);
  await page.getByTestId("account-button").click();
  const menu = page.getByTestId("account-menu");
  await expect(menu).toBeVisible();
  for (const id of ["setup", "aircraft", "checklists", "flights", "logbook", "minimums", "guide", "about"])
    await expect(menu.getByTestId(`account-menu-${id}`)).toBeVisible();
  await menu.getByTestId("account-menu-about").click();
  const account = page.getByTestId("console-sheet");
  await expect(account).toBeVisible();
  await expect(page.getByTestId("about-build")).toBeVisible();
  await account.getByTestId("console-close").click();
  await expect(account).toHaveCount(0);
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
  await expect(sideDrawer(page).getByTestId("aircraft-search")).toBeVisible();
});

test("⌘K or Ctrl K focuses the one search from anywhere on a desktop", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "a desktop's keys");
  await page.goto("/app/plan");
  await settle(page);
  await page.locator("body").click({ position: { x: 1000, y: 400 } });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await expect(page.getByTestId("search-airports")).toBeFocused();
});
