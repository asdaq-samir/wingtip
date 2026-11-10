import { test, expect } from "@playwright/test";
import { airportSearch, searchAirports, settle, sideDrawer, slow } from "./helpers";

/**
 * The one search on a desktop (docs/design/web.md §1): the airports found
 * numbered in the list and as numbered marks on the map, as Google Maps
 * numbers a search's pins; the pointer on a mark lights its row; Enter
 * opens the highlighted row's card, ⌘Enter (Ctrl Enter) does its second
 * action -- Fly Here for an airport -- named with its keys at the row's
 * right; Alt+Down leaves the highlight where it is (the APG combobox's
 * open-without-moving, the list being always open). The mobile project, a
 * phone's width, skips it: a finger has no hover and no ⌘.
 */
test.beforeEach(({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "a desktop's layout");
});

test("the airports found are numbered in the list and on the map, and a mark under the pointer lights its row", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  const search = await airportSearch(page);
  await search.fill("KOSH");
  const row = searchAirports(page).filter({ hasText: "KOSH" }).first();
  await expect(row).toBeVisible({ timeout: slow(10_000) });
  await expect(row.getByTestId("search-number")).toHaveText("1");
  // Its mark on the map, the same number (SearchMarksGl).
  const mark = page.locator('.maplibregl-marker[title="1. KOSH"]');
  await expect(mark).toBeVisible({ timeout: slow(15_000) });
  await mark.hover();
  await expect(row).toHaveAttribute("data-hot", "true");
  // Highlighted, the row names its second action and its keys.
  await expect(row.getByTestId("search-second")).toContainText(/Fly Here\s*(⌘↩|Ctrl ↩)/);
  // Let go of the search: the marks go with the list.
  await search.press("Escape");
  await expect(mark).toHaveCount(0);
});

test("Enter opens the highlighted airport's card, ⌘Enter flies there, and Alt+Down does not move the highlight", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  const search = await airportSearch(page);
  await search.fill("KOSH");
  await expect(searchAirports(page).filter({ hasText: "KOSH" }).first()).toBeVisible({ timeout: slow(10_000) });
  // Enter: the card, not the route.
  await search.press("Enter");
  const card = sideDrawer(page).getByTestId("place-card");
  await expect(card.getByTestId("place-name")).toHaveText("KOSH", { timeout: slow(10_000) });
  expect(new URL(page.url()).searchParams.get("dest")).toBeNull();
  // Again, with ⌘ or Ctrl: Fly Here, the route to it from where the pilot is.
  await page.keyboard.press("Escape");
  const again = await airportSearch(page);
  await again.fill("KOSH");
  await expect(searchAirports(page).filter({ hasText: "KOSH" }).first()).toBeVisible({ timeout: slow(10_000) });
  await again.press("ControlOrMeta+Enter");
  await expect(page).toHaveURL(/[?&]dest=KOSH(&|$)/, { timeout: slow(15_000) });
  // Alt+Down opens without moving (the APG combobox): the list is always
  // open, so the row the arrows are on stays.
  const third = await airportSearch(page);
  await third.fill("KOSH");
  await expect(searchAirports(page).filter({ hasText: "KOSH" }).first()).toBeVisible({ timeout: slow(10_000) });
  await third.press("ArrowDown");
  await expect(third).toHaveAttribute("aria-activedescendant", /.+/);
  const active = await third.getAttribute("aria-activedescendant");
  await third.press("Alt+ArrowDown");
  await expect(third).toHaveAttribute("aria-activedescendant", active!);
});
