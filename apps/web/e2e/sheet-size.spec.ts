import { test, expect } from "@playwright/test";
import { closeNavLog, frontSheet, grabberTo, navLogSheet, settle, settled, sideDrawer, slow, tapTheChart } from "./helpers";

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

test("the Nav Log, a card of its own, opens at half from the pill and leaves the sheet where it was", async ({ page }) => {
  await page.goto(`${ROUTE}&open=navlog`);
  await settle(page);
  await expect(navLogSheet(page)).toBeVisible({ timeout: slow(30_000) });
  // Its own drawer at half (the card rule's 2); the sheet under it still at its pill.
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "peek");
  await closeNavLog(page);
  await settled(sideDrawer(page));
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "peek");
});

test("the Nav Log opened over the sheet all the way up opens at half, as every card does, and leaves the sheet all the way up", async ({
  page,
}) => {
  await page.goto(ROUTE);
  await settle(page);
  await grabberTo(page, "full");
  await sideDrawer(page)
    .getByTestId("share-route")
    .click({ timeout: slow(60_000) });
  await page.getByTestId("route-navlog").click();
  await expect(navLogSheet(page)).toBeVisible();
  // Medium, whatever it covers (the owner, 2026-11-11: "I thought stock was to open each card medium by default").
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
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
