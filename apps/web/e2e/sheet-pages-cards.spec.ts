import { test, expect } from "@playwright/test";
import { grabberTo, settle, sideDrawer, frontSheet, slow } from "./helpers";
import { tab, expectPage, expectShown, openAirport } from "./sheetPages";

/**
 * Cards over the sheet's two pages, Search and FPL (the owner, 2026-11-11;
 * docs/design/rules.md §4a, and the card rule's 1): a card opened from one
 * page and put away leaves that page in sight and live, and the route
 * cleared or taken apart leaves the sheet where it was. The pages
 * themselves and their tab bar: sheet-tab-bar.spec.
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
    await tab(page, 0).click();
    await expectShown(page, 0);
    await openAirport(page, "KOSH");
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/[?&]place=/);
    await expectShown(page, 0);
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
    await page.getByTestId("share-route").first().click();
    await page.getByTestId("route-clear").click();
    await expect(page).not.toHaveURL(/[?&]dest=/);
    await expectShown(page, 1);
    // The menu went with the route; the box's Close is where it was.
    await expect(page.getByTestId("share-route")).toHaveCount(0);
    const close = sideDrawer(page).getByTestId("route-close");
    await expect(close).toHaveAccessibleName("Close");
    await close.click();
    await expect(page).toHaveURL(/[?&]place=KOSH/);
    await expectPage(page, 0);
    await expect(sideDrawer(page).getByTestId("place-card").getByTestId("place-name")).toHaveText("KOSH");
  });
});

test("the last waypoint taken out all the way up leaves the sheet all the way up", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "full");
  const line = page.getByTestId("route-line");
  if (await line.isVisible()) await line.click();
  // Focused, its caret at the end: the route box holds its pills inside
  // the field, so a click in its middle can land on a pill.
  await page.getByTestId("route-type").focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await expect(page).not.toHaveURL(/[?&]dest=/);
  await page.keyboard.press("Backspace");
  await expect(page).not.toHaveURL(/[?&]dep=/);
  await expect(page).toHaveURL(/[?&]view=briefing/);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
});
