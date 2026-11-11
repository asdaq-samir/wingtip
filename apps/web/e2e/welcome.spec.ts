import { test, expect } from "@playwright/test";
import { consolePage, openSetup, settle, slow } from "./helpers";

/**
 * The welcome (features/plan/components/welcome, useWelcome): the first
 * time the planner opens on a device with no route, one card (no tour):
 * the airplane, optional (No Airplane the default), Plan a Flight into the
 * one search, and the sample flight, Madison to Oshkosh, opened in one tap
 * with its nav log. Seen, it is not shown again, until the Guide's Show Welcome Again. The suite's session has
 * it seen; this spec starts with none seen, once, so a reload keeps what it saw.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("welcome-fresh")) return;
    localStorage.removeItem("wingtip.tips");
    sessionStorage.setItem("welcome-fresh", "1");
  });
});

test("a new pilot is welcomed once, and the sample flight opens with its nav log in one tap", async ({ page }) => {
  test.setTimeout(slow(90_000));
  await page.goto("/app/plan");
  await settle(page);
  const welcome = page.getByTestId("welcome");
  await expect(welcome).toBeVisible({ timeout: slow(15_000) });
  // No airplane is assumed (docs/decisions/0011).
  await expect(welcome.getByTestId("welcome-no-airplane")).toHaveAttribute("aria-checked", "true");
  // The focus on its title (APG dialog), the primary filled under the choice.
  await expect(welcome.locator(":focus")).toHaveText("Welcome to Wingtip Maps");
  // A card in the map's sheet, no modal, on a phone too (the one card
  // rule, 2026-11-10): the map usable (docs/design/web.md §14).
  await expect(welcome).toHaveAttribute("role", "region");
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
  await welcome.getByTestId("welcome-sample").click();

  await expect(page).toHaveURL(/dep=KMSN/);
  await expect(page).toHaveURL(/dest=KOSH/);
  // A phone's list, or a desktop's table (docs/design/web.md §4).
  const navlog = page.getByTestId(/^navlog-(list|table)$/);
  await expect(navlog).toBeVisible({ timeout: slow(60_000) });
  await expect(welcome).toHaveCount(0);
  await expect(page.getByTestId("first-flight")).toHaveCount(0);

  // Seen: not shown again on this device, even with no route.
  await page.goto("/app/plan");
  await settle(page);
  await page.waitForTimeout(1500);
  await expect(welcome).toHaveCount(0);
});

test("Plan a Flight puts the pilot in the one search, and the welcome is seen", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  const welcome = page.getByTestId("welcome");
  await expect(welcome).toBeVisible({ timeout: slow(15_000) });
  await welcome.getByTestId("welcome-plan").click();
  await expect(welcome).toHaveCount(0);
  // The one search's field (OneSearchField), focused for the first airport.
  await expect(page.locator('[data-slot="map-panel"] input[type="search"]').first()).toBeFocused({ timeout: slow(10_000) });
  // Seen: a reload does not bring it back.
  await page.reload();
  await settle(page);
  await page.waitForTimeout(1500);
  await expect(welcome).toHaveCount(0);

  // The Guide offers it again, at its top (the owner's "Tips can move to guide"); no pointing tip comes with it
  // (the owner, 2026-11-11).
  await openSetup(page);
  await consolePage(page.getByTestId("console-sheet"), "Guide");
  await page.getByTestId("tips-reset").click();
  await expect(page.getByTestId("tips-reset")).toContainText("Welcome Will Show Again");
  await page.goto("/app/plan");
  await settle(page);
  await expect(welcome).toBeVisible({ timeout: slow(15_000) });
});
