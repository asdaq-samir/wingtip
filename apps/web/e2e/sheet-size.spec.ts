import { test, expect } from "@playwright/test";
import { closeNavLog, grabberTo, navLogSheet, settle, settled, sideDrawer, slow, tapTheChart } from "./helpers";

/**
 * The sheet keeps the size the pilot left it at, as Apple Maps' does (the
 * owner, 2026-11-11: "I like the stock behavior"): the one size the app
 * gives it is half, when something new opens while it is at the pill, so
 * it can be seen. Nothing lowers it, nothing takes it all the way up, and
 * a page put away leaves it where it is. Cards size their own drawers
 * (lib/sheetCards), which these leave alone.
 */

const ROUTE = "/app/plan?dep=C81&dest=KDLH";

test.beforeEach(({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet and its three sizes");
});

test("the nav log opened from the pill raises the sheet to half, and put away leaves it there", async ({ page }) => {
  await page.goto(`${ROUTE}&open=navlog`);
  await settle(page);
  await expect(navLogSheet(page)).toBeVisible({ timeout: slow(30_000) });
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "half");
  await closeNavLog(page);
  await settled(sideDrawer(page));
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "half");
});

test("the nav log opened all the way up stays all the way up, and so does the sheet once it is put away", async ({ page }) => {
  await page.goto(ROUTE);
  await settle(page);
  await grabberTo(page, "full");
  await sideDrawer(page)
    .getByTestId("share-route")
    .click({ timeout: slow(60_000) });
  await page.getByTestId("route-navlog").click();
  await expect(navLogSheet(page)).toBeVisible();
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "full");
  await closeNavLog(page);
  await settled(sideDrawer(page));
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "full");
});

test("a link to a list opens it half way, not all the way up", async ({ page }) => {
  await page.goto("/app/plan?saved=1");
  await settle(page);
  await expect(sideDrawer(page).getByTestId("saved-page")).toBeVisible();
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "half");
});

test("an airport's card closed by a tap on the chart leaves the sheet under it as it was", async ({ page }) => {
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  await expect(page.getByTestId("place-card")).toBeVisible({ timeout: slow(30_000) });
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "half");
  await tapTheChart(page);
  await expect(page.getByTestId("place-card")).toHaveCount(0);
  await settled(sideDrawer(page));
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "half");
});
