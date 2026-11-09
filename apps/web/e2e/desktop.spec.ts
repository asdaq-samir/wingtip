import { test, expect } from "@playwright/test";
import { openPanel, settle, sideDrawer } from "./helpers";

/**
 * The desktop web, from 1024 wide with a mouse (the UI audit, 2026-11-09):
 * a side panel wide enough for a desktop's type rather than the phone's
 * 384-point card, the route box's small buttons with their words, and the
 * keyboard's ways round -- / to the search, 1 to 4 for the tabs, Escape
 * back one level. The mobile project, a phone's width, skips it.
 */
test.beforeEach(({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "a desktop's layout");
});

test("the side panel is the wide one, with rows at a desktop's size", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await openPanel(page);
  const box = await sideDrawer(page).boundingBox();
  expect(box!.width).toBe(448);
  // A row's words at 16 with a mouse (TEXT.row), not the 14 and less the
  // phone's card had.
  await page.getByTestId("tab-airport").click();
  const size = await sideDrawer(page)
    .locator('input[type="search"]')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});

test("/ goes to the search, 1 to 4 open the tabs, Escape goes back a level", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await openPanel(page);
  await page.locator("body").click({ position: { x: 1000, y: 400 } });
  await page.keyboard.press("3");
  await expect(page.getByTestId("tab-aircraft")).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("2");
  await expect(page.getByTestId("tab-airport")).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("/");
  await expect(page.locator('[data-slot="map-panel"] input[type="search"]:focus')).toHaveCount(1);
  // Typed into, the keys are the field's.
  await page.keyboard.type("1");
  await expect(page.getByTestId("tab-airport")).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await page.keyboard.press("4");
  await expect(page.getByTestId("console-sheet")).toBeVisible();
  // Escape puts Setup away again.
  await page.locator("body").click({ position: { x: 1000, y: 400 } });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("console-sheet")).toHaveCount(0);
});

test("the route box's Profile and Brief say their words on a desktop", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await expect(page.getByTestId("route-brief")).toContainText("Brief", { timeout: 30_000 });
});
