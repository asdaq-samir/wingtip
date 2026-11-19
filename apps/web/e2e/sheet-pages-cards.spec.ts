import { test, expect } from "@playwright/test";
import { clearTheRoute, grabberTo, settle, sideDrawer, frontSheet, slow } from "./helpers";
import { expectPage, expectSearchInUse, expectShown, openAirport, showPage } from "./sheetPages";

/**
 * Cards over the sheet's two pages, Search and FPL (the owner, 2026-11-11;
 * docs/design/rules.md §4a, and the card rule's 1): a card opened from one
 * page and put away leaves that page in sight and live, and the route
 * cleared or taken apart leaves the sheet where it was. The pages
 * themselves and their toggle: sheet-page-toggle.spec.
 */

test.describe("cards over the pages", () => {
  test.use({ geolocation: { latitude: 42.3246, longitude: -88.0741 }, permissions: ["geolocation"] });

  test("Fly Here from an airport's card lands on FPL, the page in sight and live", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await grabberTo(page, "half");
    await expectShown(page, 0);
    await openAirport(page, "KOSH");
    await sideDrawer(page).getByTestId("place-card").getByTestId("fly-here").click();
    await expect(page).toHaveURL(/[?&]dest=KOSH/, { timeout: slow(15_000) });
    await expectShown(page, 1);
    await expect(sideDrawer(page).getByTestId("route-brief")).toBeVisible({ timeout: slow(30_000) });
  });

  test("an airport's card opened on Search over a route and closed leaves Search in sight", async ({ page }) => {
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await grabberTo(page, "half");
    await showPage(page, 0);
    await expectShown(page, 0);
    await openAirport(page, "KOSH");
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/[?&]place=/);
    // Search in sight and live, its query kept for the way back
    // (docs/design/rules.md, the card's row).
    await expectSearchInUse(page, "KOSH");
  });

  test("Find Nearby's Stops open over Search and their close goes back to it", async ({ page }) => {
    // docs/design/rules.md, card rule 1: the close goes back where it came from.
    await page.goto("/app/plan");
    await settle(page);
    await grabberTo(page, "half");
    await sideDrawer(page).getByRole("button", { name: /^Fuel/ }).first().click();
    const stops = sideDrawer(page).getByTestId("stops-card");
    await expect(stops).toBeVisible({ timeout: slow(10_000) });
    await expectPage(page, 0);
    await page.getByTestId("stops-close").click();
    await expect(stops).toBeHidden();
    await expectShown(page, 0);
  });

  test("the route cleared, the empty box's Close goes back to the airport it was flown to from", async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await grabberTo(page, "half");
    await openAirport(page, "KOSH");
    await sideDrawer(page).getByTestId("place-card").getByTestId("fly-here").click();
    await expect(page).toHaveURL(/[?&]dest=KOSH/, { timeout: slow(15_000) });
    // Flown to from where the airplane is, a whole route: cleared from its
    // ••• (half a route has the route box's own ✕, the owner, 2026-11-18).
    await expect(sideDrawer(page).getByTestId("timeline-ident")).toHaveText(["My Location", "KOSH"], { timeout: slow(15_000) });
    await clearTheRoute(page);
    await expect(page).not.toHaveURL(/[?&]dest=/);
    await expectShown(page, 1);
    // The route's actions went with it, no ••• in the first row and no ✕
    // of its own, the page toggle at the bar's end going back to the
    // search (the owner, 2026-11-14: the two did the same); the empty box's
    // Undo instead.
    await expect(sideDrawer(page).getByTestId("route-strip").getByTestId("share-route")).toHaveCount(0);
    await expect(sideDrawer(page).getByTestId("route-undo")).toBeVisible();
    await expect(sideDrawer(page).getByTestId("route-close")).toHaveCount(0);
  });
});

test("the route cleared all the way up leaves the sheet all the way up", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "full");
  // The route cleared from its ••• menu: nothing of it left.
  await clearTheRoute(page);
  await expect(page).not.toHaveURL(/[?&]dest=/);
  await expect(page).not.toHaveURL(/[?&]dep=/);
  await expect(page).toHaveURL(/[?&]view=full/);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
});
