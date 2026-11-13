import { test, expect } from "@playwright/test";
import { grabberTo, settle, showSearch } from "./helpers";
import { ownHomeBase } from "./oneSearch";

// Apple Maps' Favorites row has one Add at its end: the airports, then the
// airplanes, then a menu offering what to add (the owner, 2026-11-13: two
// Add tiles read as the same twice).
test("the search's Favorites row has one Add, a menu of Airport and Airplane", async ({ page }) => {
  await ownHomeBase(page, "C81");
  await page.addInitScript(() => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":9}');
    const state = { ...kept.state, favoriteAircraft: [{ hex: "a1b2c3", name: "N654FL", type: "C172", kind: "high" }] };
    localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state }));
  });
  await page.goto("/app/plan");
  await settle(page);
  await showSearch(page);
  await grabberTo(page, "full");
  const row = page.getByTestId("pill-favorites-row");
  await expect(row.getByTestId("pill-aircraft-favorite")).toBeVisible();
  await expect(row.getByRole("button", { name: /Add a Favorite/ })).toHaveCount(1);
  await expect(row.getByTestId("pill-favorite-add")).toBeVisible();
  await row.getByTestId("pill-favorite-add").click();
  await expect(page.getByTestId("pill-favorite-add-airport")).toBeVisible();
  await expect(page.getByTestId("pill-favorite-add-airplane")).toBeVisible();
  await page.getByTestId("pill-favorite-add-airport").click();
  await expect(page.getByTestId("search-airports")).toHaveAttribute("placeholder", "Search for an airport to keep");
});
