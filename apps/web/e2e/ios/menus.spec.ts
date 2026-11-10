import { test, expect } from "@playwright/test";
import { grabberTo, settle, showSearch, sideDrawer } from "../helpers";

/**
 * A menu's rows to a finger, as iOS's own menus' are: 44 points each, the
 * row the control, as the grouped lists' rows are (GroupedList), where
 * they were 31 to 34 (the commonality audit's C-2). On the iOS devices,
 * a touch pointer: the "mobile" project's viewport alone has none.
 */
test("a menu's rows are 44 points tall to a finger", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  // The flights' strip's filter on the one search's own page: Saved or
  // Recents.
  await showSearch(page);
  await grabberTo(page, "full");
  await sideDrawer(page).getByTestId("fpl-strip-shows").click();
  const items = page.getByRole("menuitemradio");
  await expect(items).toHaveCount(2);
  // Each row's own height, as laid out: the menu scales in as it opens,
  // and its box measured mid-way was 43.8.
  for (const item of await items.all()) expect(await item.evaluate((el) => (el as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
});
