import { test, expect } from "@playwright/test";
import { airportSearch, searchAirports, settle, sideDrawer, slow } from "./helpers";

/**
 * The one search on a desktop (docs/design/web.md §1), Base UI's
 * Autocomplete as it is: the first row highlighted as the results come
 * (autoHighlight "always"), so Enter opens its card. The mobile project, a
 * phone's width, skips it.
 */
test.beforeEach(({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "a desktop's layout");
});

test("Enter opens the first airport's card, the row the search highlights", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  const search = await airportSearch(page);
  await search.fill("KOSH");
  await expect(searchAirports(page).filter({ hasText: "KOSH" }).first()).toBeVisible({ timeout: slow(10_000) });
  await expect(search).toHaveAttribute("aria-activedescendant", /.+/);
  await search.press("Enter");
  const card = sideDrawer(page).getByTestId("place-card");
  await expect(card.getByTestId("place-name")).toHaveText("KOSH", { timeout: slow(10_000) });
  expect(new URL(page.url()).searchParams.get("dest")).toBeNull();
});
