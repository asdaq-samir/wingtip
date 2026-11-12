import { test, expect } from "@playwright/test";
import { grabberTo, searchAirports, settle, showTabs } from "./helpers";

/**
 * Fly Here as an EFB's Direct-To, at the pilot's ask: from where the
 * pilot is -- the present position itself, as in the air a Direct-To goes
 * from wherever the airplane is -- over Home. The position is near
 * Campbell Airport (C81), and Home is set to Madison, elsewhere.
 */
test.use({ geolocation: { latitude: 42.3246, longitude: -88.0741 }, permissions: ["geolocation"] });

test("Fly Here goes direct from the present position, not from Home", async ({ page }) => {
  await page.goto("/app/plan?home=KMSN");
  await expect(page).not.toHaveURL(/[?&]home=/, { timeout: 10_000 });
  await settle(page);
  // The one search, at the pill: the sheet's first row.
  await grabberTo(page, "peek");
  await showTabs(page);
  const search = page.getByTestId("search-airports");
  await search.click();
  await search.fill("KDLH");
  await searchAirports(page).filter({ hasText: "KDLH" }).first().click();
  await page.getByTestId("place-card").getByTestId("fly-here").click();
  await expect(page).toHaveURL(/[?&]dest=KDLH/, { timeout: 15_000 });
  await expect(page).toHaveURL(/[?&]dep=(%40|@)42\.3246(%2C|,)-88\.0741/);
  // Half way, where the card was, the route's box from the present
  // position: put away, the pill is the route's figures alone.
  await expect(page.getByTestId("route-dep")).toContainText("POS0");
});
