import { test, expect } from "@playwright/test";
import { frontSheet, searchAirports, settle, slow } from "./helpers";
import { expectPage, toggle } from "./sheetPages";

/**
 * The first flight (FirstFlight, useFirstFlight; the owner's option A,
 * 2026-11-13): the welcome sheet the first time the planner opens with no
 * route on this device; Let's Go Flying leaves the one search ready for
 * where to, the airport picked is planned to from where the airplane is, FPL comes
 * up and one tip points at the page toggle once it shows FPL; each once. The suite's session has the
 * tips all seen, these with them; this spec starts with none seen, once,
 * so a reload keeps what it saw.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("first-fresh")) {
      // None seen.
      localStorage.removeItem("wingtip.tips");
      sessionStorage.setItem("first-fresh", "1");
    }
    // Own ship on with a fix by Campbell (C81), where the first flight
    // departs from: the planner's nearest field to it.
    const position = () =>
      ({
        coords: {
          latitude: 42.325,
          longitude: -88.074,
          accuracy: 10,
          altitude: 300,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
          toJSON() {
            return this;
          },
        },
        timestamp: Date.now(),
        toJSON() {
          return this;
        },
      }) as unknown as GeolocationPosition;
    Geolocation.prototype.watchPosition = function (success: PositionCallback) {
      window.setTimeout(() => success(position()), 0);
      return window.setInterval(() => success(position()), 1000);
    };
    Geolocation.prototype.clearWatch = function (id: number) {
      window.clearInterval(id);
    };
    localStorage.setItem(
      "wingtip.ownship",
      JSON.stringify({ state: { enabled: true, follow: false, lastFix: { lat: 42.325, lon: -88.074 } }, version: 0 }),
    );
  });
});

test("a new pilot is welcomed, Let's Go Flying leaves the one search ready, the pick is planned from where the airplane is and the FPL toggle is pointed out once", async ({
  page,
}) => {
  test.setTimeout(slow(90_000));
  await page.goto("/app/plan");
  await settle(page);
  const welcome = page.getByTestId("first-flight");
  await expect(welcome).toBeVisible({ timeout: slow(15_000) });
  await expect(welcome.getByRole("heading", { name: "Welcome to Wingtip Maps" })).toBeVisible();
  for (const row of ["Search, like Maps", "FPL, like your EFB", "FAA charts that move like Maps"])
    await expect(welcome.getByText(row)).toBeVisible();
  // One way on (the owner, 2026-11-13).
  await expect(welcome.getByRole("button")).toHaveCount(1);

  // Let's Go Flying: the sheet gone, Search up and its field asking for
  // the destination -- not focused, so no keyboard jumps up.
  await welcome.getByTestId("first-flight-go").click();
  await expect(welcome).toHaveCount(0);
  await expectPage(page, 0);
  // Risen from the pill to half, so the search's page is seen (rule 11).
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  const search = page.getByTestId("search-airports");
  await expect(search).not.toBeFocused();
  await expect(search).toHaveAttribute("placeholder", /destination/i);

  // Oshkosh picked: planned from the nearest field to the fix (Campbell),
  // FPL up with the route; the tip on the toggle once it shows FPL.
  await search.click();
  await search.fill("KOSH");
  await searchAirports(page)
    .filter({ hasText: "KOSH" })
    .first()
    .click({ timeout: slow(15_000) });
  await expect(page).toHaveURL(/dest=KOSH/, { timeout: slow(30_000) });
  await expectPage(page, 1);
  // The tip waits for the toggle to show FPL: on FPL it shows the magnifier.
  const tip = page.getByTestId("fpl-tip");
  await expect(tip).toHaveCount(0);
  await toggle(page).click();
  await expectPage(page, 0);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Your flight plan is one tap away");
  await expect(tip).toContainText("Tap here any time");
  // Over the toggle, its arrow at it.
  const [tipBox, toggleBox] = [await tip.boundingBox(), await toggle(page).boundingBox()];
  expect(tipBox!.y + tipBox!.height).toBeLessThanOrEqual(toggleBox!.y);
  await tip.getByTestId("fpl-tip-close").click();
  await expect(tip).toHaveCount(0);

  // Seen, both: neither offered again on this device, even with no route.
  await page.goto("/app/plan");
  await settle(page);
  await page.waitForTimeout(1500);
  await expect(welcome).toHaveCount(0);
  await page.goto("/app/plan?dep=C81&dest=KMSN");
  await settle(page);
  await page.waitForTimeout(1500);
  await expect(tip).toHaveCount(0);
});
