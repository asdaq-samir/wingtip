import { test, expect } from "@playwright/test";
import { grabberTo, settle, showPlan, sideDrawer } from "../helpers";

/**
 * A menu's rows to a finger, as iOS's own menus' are: 44 points each, the
 * row the control, as the grouped lists' rows are (GroupedList), where
 * they were 31 to 34 (the commonality audit's C-2). On the iOS devices,
 * a touch pointer: the "mobile" project's viewport alone has none.
 */
test("a menu's rows are 44 points tall to a finger", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  // The flights' strip's filter on FPL's own page, where the Saved and
  // Recent flights are since the owner's word of 2026-11-11 ("We can
  // remove plan button and saved from search", 3eb6e1417): Saved or
  // Recents (the pull-down, a Select's options in the menu look). On the
  // search's page the strip was out of sight, and the click waited for it
  // till the test's two minutes (main's nightly 44926432837), as the
  // audit's "FPL, Saved and Recents" did (54294d1e1).
  await showPlan(page);
  await grabberTo(page, "full");
  await sideDrawer(page).getByTestId("fpl-strip-shows").click();
  const items = page.getByRole("option");
  await expect(items).toHaveCount(2);
  // Each row's own height, as laid out: the menu scales in as it opens,
  // and its box measured mid-way was 43.8.
  for (const item of await items.all()) expect(await item.evaluate((el) => (el as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
});
