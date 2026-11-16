import { test, expect } from "@playwright/test";
import { grabberTo, settle, showSearch, sideDrawer } from "./helpers";
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

// The airplanes' Adds ask the one search, as the airports' do: the traffic's
// own search page, which they opened, went for it (the owner, 2026-11-14).
test("the Favorites' Add, Airplane, asks the one search for one, and the one picked is kept", async ({ page }) => {
  await page.addInitScript(() => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":9}');
    const state = {
      ...kept.state,
      favoriteAircraft: [{ hex: "a1b2c3", name: "N654FL", type: "C172", kind: "high" }],
      recentAircraft: [{ hex: "a2b3c4", name: "N200XY", type: "PA28", kind: "high" }],
    };
    localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state }));
  });
  await page.goto("/app/plan");
  await settle(page);
  await showSearch(page);
  const row = page.getByTestId("pill-favorites-row");
  await row.getByTestId("pill-favorite-add").click();
  await page.getByTestId("pill-favorite-add-airplane").click();
  const search = page.getByTestId("search-airports");
  await expect(search).toHaveAttribute("placeholder", "Search for an airplane to keep");
  await expect(search).toBeFocused();
  await search.fill("N200");
  await sideDrawer(page).getByTestId("search-airplane").filter({ hasText: "N200XY" }).click();
  // Kept, not opened: no airplane's card, and the field back to all it finds.
  await expect(page).not.toHaveURL(/[?&]flight=/);
  await expect(row.getByTestId("pill-aircraft-favorite")).toHaveCount(2);
  await expect(row.getByTestId("pill-aircraft-favorite").last()).toContainText("N200XY");
  await expect(search).toHaveAttribute("placeholder", "Search airports and airplanes");
});
