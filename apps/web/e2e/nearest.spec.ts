import { test, expect } from "@playwright/test";
import { closeCard, grabberTo, settle, showPlan, showSearch, sideDrawer, slow, frontSheet } from "./helpers";

/**
 * Nearest as a card of the panel's (NearestCard), at the pilot's ask: half
 * way up, the map fitted to the fields above it, a field opened as a
 * layer over the list and its close back to it. And the fields the armed
 * services keep to themselves, off the map until the Map sheet's
 * Military is on. The fields are put in the planner's answers, so where
 * they are is known.
 */
test.use({ geolocation: { latitude: 42.3246, longitude: -88.0741 }, permissions: ["geolocation"] });

const FIELD = { kind: "small", longest_runway_ft: 3500, flight_category: "VFR", military: null };

test("Nearest opens as a card half way up, a field over it as a layer, and its close back to the list", async ({ page }) => {
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airports/nearest"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          airports: [
            { ...FIELD, ident: "C81", name: "Campbell", lat: 42.3246, lon: -88.0741, distance_nm: 0.1, bearing_deg: 0 },
            {
              ...FIELD,
              ident: "KUGN",
              name: "Waukegan National",
              lat: 42.4222,
              lon: -87.8679,
              distance_nm: 11,
              bearing_deg: 55,
              radio: { kind: "TWR", mhz: 120.4 },
            },
            { ...FIELD, ident: "KFHU", name: "Libby AAF", lat: 42.45, lon: -88.2, distance_nm: 9, bearing_deg: 320, military: "joint" },
          ],
        }),
      }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  // The one search's own page's Nearest, its title the list in full (the
  // one-search design, 2026-11-09: what the Airport tab listed).
  await grabberTo(page, "peek");
  await showSearch(page);
  // With no position yet, the strip offers to show it.
  await sideDrawer(page)
    .getByTestId("nearest-strip-position")
    .or(sideDrawer(page).getByTestId("nearest-strip-field").first())
    .first()
    .click({ trial: true });
  if (await sideDrawer(page).getByTestId("nearest-strip-position").isVisible())
    await sideDrawer(page).getByTestId("nearest-strip-position").click();
  await expect(sideDrawer(page).getByTestId("nearest-strip-field").first()).toBeVisible({ timeout: slow(15000) });
  await sideDrawer(page).getByTestId("pill-section-nearest-more").click();
  const card = sideDrawer(page).getByTestId("nearest-card");
  await expect(card).toBeVisible();
  // At half, as every card opens (the owner, 2026-11-11).
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  const rows = card.getByTestId("nearest-airport");
  await expect(rows).toHaveCount(3, { timeout: slow(15000) });
  // Nearest first, measured from the airplane's own fix (the engine's
  // geodesic), not the planner's rounded point (WEB-3): Libby AAF, 8.9 nm,
  // before Waukegan's 11.
  await expect(rows.nth(1)).toContainText("KFHU");
  await expect(rows.nth(1)).toContainText("joint use");
  // Each row its weather, its runway and its listed frequency, and
  // how far and which way, its arrow pointing there (north up, the
  // airplane not moving).
  const kugn = rows.nth(2);
  await expect(kugn).toContainText("VFR");
  await expect(kugn).toContainText("3,500 ft · TWR 120.4");
  await expect(kugn).toContainText("11 nm");
  await expect(kugn).toContainText("NE");
  await expect(kugn.getByTestId("nearest-arrow")).toHaveAttribute("style", /rotate\(5[4-6](\.\d+)?deg\)/);

  await kugn.click();
  await expect(sideDrawer(page).getByTestId("place-card")).toBeVisible();
  await closeCard(page, "place-close");
  await expect(card).toBeVisible();
  // Its Back, as every list in full has one: the search's own page, the
  // strip again; then the list once more.
  await card.getByTestId("nearest-page-close").click();
  await expect(card).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]near=/);
  await expect(sideDrawer(page).getByTestId("pill-section-nearest-more")).toBeVisible();
  await sideDrawer(page).getByTestId("pill-section-nearest-more").click();
  await expect(card).toBeVisible();
  // Back to the route: the list is a card over the sheet, the Drawer's own
  // nested drawer (sheet/CardStack), its ✕ first, then the search's Cancel
  // and FPL, the plan under it.
  await card.getByTestId("nearest-page-close").click();
  await showPlan(page);
  await expect(card).toHaveCount(0);
  // The sheet where it was left, half way (the card rule's 11: nothing
  // raises or lowers it), the route's nav log on FPL.
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  await expect(sideDrawer(page).getByTestId("navlog-scroller")).toBeVisible();
});

test(
  "Nearest is from a place typed -- a town, an address, an airport -- and back from the position at its clear",
  { tag: "@smoke" },
  async ({ page }) => {
    const asked: string[] = [];
    await page.route(
      (url) => url.pathname.endsWith("/api/planner/airports/nearest"),
      (route) => {
        const at = new URL(route.request().url()).searchParams;
        asked.push(`${at.get("lat")},${at.get("lon")}`);
        return route.fulfill({
          json: {
            airports: [
              { ...FIELD, ident: "KMSN", name: "Dane County Regional", lat: 43.14, lon: -89.34, distance_nm: 4.1, bearing_deg: 40 },
            ],
          },
        });
      },
    );
    await page.route(
      (url) => url.pathname.endsWith("/api/planner/places/search"),
      (route) =>
        route.fulfill({
          json: {
            places: [
              { label: "Madison, WI", kind: "town", lat: 43.0849, lon: -89.3888 },
              { label: "Madison, AL", kind: "town", lat: 34.7, lon: -86.74 },
            ],
          },
        }),
    );
    await page.goto("/app/plan?near=1");
    await settle(page);
    const card = sideDrawer(page).getByTestId("nearest-card");
    // NRST's field is the one search, scoped to where from (the one card rule).
    const field = sideDrawer(page).getByTestId("nearest-from");
    await expect(field).toHaveAttribute("placeholder", "Current position");

    await field.fill("madison");
    await card.getByTestId("nearest-from-option").filter({ hasText: "Madison, WI" }).click();
    await expect(card).toContainText("Near Madison, WI");
    await expect(page).toHaveURL(/[?&]nearAt=43\.0849(%2C|,)-89\.3888/);
    await expect(card.getByTestId("nearest-airport")).toContainText("KMSN");
    expect(asked).toContain("43.1,-89.4");

    // Its clear: from the position again.
    await sideDrawer(page).getByTestId("search-clear").click();
    await expect(page).not.toHaveURL(/nearAt=/);
    await expect(field).toHaveValue("");
  },
);
