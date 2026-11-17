import { test, expect } from "@playwright/test";
import { openPanel, openRoute, settle, sideDrawer, slow } from "./helpers";
import { card } from "./placeCard";

/**
 * FPL's airports one block each, folded until their lines are tapped, as the pilot first sees them, at the owner's pick (boards 4 and 5
 * of the canvas): the ident on top, a fuel stop's pump before it and the
 * fuel in the tanks after it, the time over the elevation, the wind under;
 * opened, a line for the landing and one for the takeoff, no words for
 * either ("no need to use the word depart, fuel stop, arrive"). The rest of
 * the suite starts with them opened (auth.setup's vfr.fieldsOpen); here
 * they start as a pilot's do.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("wingtip.fieldsOpen");
    } catch {
      /* no storage */
    }
  });
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("the departure and the destination are one block each, opened and folded by a tap on their lines", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const route = sideDrawer(page).getByTestId("procedures");
  for (const name of ["C81 · Depart", "KDLH · Arrive"]) {
    const field = route.getByRole("region", { name });
    const toggle = field.getByTestId("field-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false", { timeout: slow(30_000) });
    // Its time over its elevation, its wind and its menu, no runways or
    // procedures under it, and no words for what it is but its role over the ident.
    await expect(field.getByTestId("point-figures")).toBeVisible();
    await expect(field.getByTestId("point-altitude-figure")).toContainText(/\d ft/);
    await expect(field).not.toContainText(/Arrive|Fuel stop/);
    await expect(field.getByTestId("procedure-pattern")).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(field.getByTestId("procedure-pattern").first()).toBeVisible({ timeout: slow(30_000) });
    await toggle.click();
    await expect(field.getByTestId("procedure-pattern")).toHaveCount(0);
  }
});

test("a stop is one block, its landing and its takeoff a tap away, and a fuel stop wears the pump before its ident", async ({ page }) => {
  // The fields alone: the plan through the stop is not what is tried.
  await page.route(
    (url) => /\/(course|checkpoints|navlog|briefing)$/.test(url.pathname) && !!url.searchParams.get("stops"),
    (route) => route.abort(),
  );
  await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH&fuel=KMSN");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const route = sideDrawer(page).getByTestId("procedures");
  const stop = route.getByRole("region", { name: "KMSN · Arrive" });
  await expect(stop).toBeVisible({ timeout: slow(30_000) });
  await expect(stop.getByRole("img", { name: "fuel stop" })).toBeVisible();
  await expect(route).not.toContainText("Fuel stop");
  await expect(route.getByRole("region", { name: "KMSN · Depart" })).toHaveCount(0);
  await stop.getByTestId("field-toggle").click();
  await expect(stop.getByRole("img", { name: "landing" })).toBeVisible();
  await expect(route.getByRole("region", { name: "KMSN · Depart" }).getByRole("img", { name: "takeoff" })).toBeVisible();
  await stop.getByTestId("field-toggle").click();
  await expect(route.getByRole("region", { name: "KMSN · Depart" })).toHaveCount(0);
  // A stop of the pilot's own: no pump.
  await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH");
  await openPanel(page);
  await openRoute(page);
  await expect(route.getByRole("region", { name: "KMSN · Arrive" })).toBeVisible({ timeout: slow(30_000) });
  await expect(route.getByRole("img", { name: "fuel stop" })).toHaveCount(0);
});

test("an airport's ident opens its card as the nav log's names do, the rest of its row folding it open, with one disclosure", async ({
  page,
}) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const field = sideDrawer(page).getByTestId("procedures").getByRole("region", { name: "KDLH · Arrive" });
  const toggle = field.getByTestId("field-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false", { timeout: slow(30_000) });
  // No chevron of its own: the row's lines are the disclosure, the symbol the menu (C14).
  await expect(toggle.locator("svg")).toHaveCount(0);
  // Always a card, the Nav Log's picked row's fill, no border; opened, it
  // grows with its runways and procedures inside it (the owner, 2026-11-17).
  const block = sideDrawer(page).locator('[data-testid="route-field"][data-ident="KDLH"]');
  const fill = await block.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fill).not.toBe("rgba(0, 0, 0, 0)");
  await expect(block).toHaveCSS("border-top-width", "0px");
  const shut = (await block.boundingBox())!.height;
  await field.getByTestId("field-wind").click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(field.getByTestId("procedure-pattern").first()).toBeVisible({ timeout: slow(30_000) });
  expect((await block.boundingBox())!.height).toBeGreaterThan(shut);
  await expect(block.getByTestId("procedure-pattern").first()).toBeVisible();
  const ident = field.getByTestId("field-open");
  await expect(ident).toHaveAccessibleName("KDLH: open the airport");
  await ident.click();
  await expect(card(page)).toContainText("KDLH", { timeout: slow(15_000) });
});

test("in the route's cards an airport is changed from its menu's Change, by the one search, its ident a link", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const field = sideDrawer(page).getByTestId("procedures").getByRole("region", { name: "KDLH · Arrive" });
  await expect(field.getByTestId("field-open")).toBeVisible({ timeout: slow(30_000) });
  await expect(field.getByRole("combobox")).toHaveCount(0);
  await field.getByTestId("point-menu").click();
  await page.getByTestId("point-menu-change").click();
  const search = page.getByTestId("search-airports");
  await expect(search).toBeFocused({ timeout: slow(10_000) });
  await search.fill("KMSP");
  await search.press("Enter");
  await expect(page).toHaveURL(/dest=KMSP/, { timeout: slow(15_000) });
});
