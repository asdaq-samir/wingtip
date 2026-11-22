import { test, expect } from "@playwright/test";
import { inSheet, settle, sideDrawer } from "./helpers";

/**
 * A frequency wherever it is shown is copied by a tap (components/
 * FrequencyButton), the same verb, Copy, as the phones'. The browser's
 * clipboard is stood in for, so what was copied can be read back on every
 * project (WebKit's asks no permission a test can grant).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.assign(window, { copied });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    });
  });
});

test("an airport's frequency is copied as pilots write it, and says so where it was tapped", async ({ page }) => {
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  const card = sideDrawer(page).getByTestId("place-card");
  await card.getByTestId("place-tab-radio").click();
  const tower = card.getByTestId("place-frequency").filter({ hasText: "Tower" }).first();
  const copy = tower.getByTestId("frequency-copy");
  // The card opens at half, where its body does not scroll (rules.md,
  // "Grow, then scroll"): a row under the half's edge is pulled up into
  // sight first, as a pilot does, not scrolled behind the pinned head.
  await inSheet(page, copy);
  await expect(copy).toHaveAccessibleName(/^Copy .*Tower 118\.3$/);
  await copy.click();
  // "Copied" by it, the app's one confirmation (lib/doneNote), the figure kept.
  await expect(page.locator('[data-slot="toast"]').filter({ hasText: "Copied" })).toBeVisible();
  await expect(copy).toHaveText("118.3");
  expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual(["118.3"]);
});
