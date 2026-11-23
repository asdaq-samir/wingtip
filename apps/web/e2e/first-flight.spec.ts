import { test, expect } from "@playwright/test";
import { frontSheet, grabberTo, searchAirports, settle, slow } from "./helpers";
import { expectPage, expectSearchInUse, showPage, toggle } from "./sheetPages";
import { watchFor } from "./pacing";

/**
 * The first flight (FirstFlight, useFirstFlight; the owner's option A,
 * 2026-11-13): the welcome sheet the first time the planner opens with no
 * route on this device; Later leaves the one search ready for
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

test("a new pilot is welcomed, Later leaves the one search ready, the pick is planned from where the airplane is and the FPL toggle is pointed out once", async ({
  page,
}) => {
  test.setTimeout(slow(90_000));
  await page.goto("/app/plan");
  await settle(page);
  const welcome = page.getByTestId("first-flight");
  await expect(welcome).toBeVisible({ timeout: slow(15_000) });
  await expect(welcome.getByRole("heading", { name: "Welcome to Wingtip Maps" })).toBeVisible();
  for (const row of ["Search, Like Maps", "FPL, Like Your EFB", "FAA Charts That Move Like Maps"])
    await expect(welcome.getByText(row)).toBeVisible();
  // Its search row in the search field's own words (UI audit C17).
  await expect(welcome).toContainText("Search airports and airplanes the way you would in Apple or Google Maps.");
  // Theme and Appearance on the Map card's own look tiles (lookPicks'
  // LayerMenuTile), two side by side and one size, each its value under
  // its name and a tap its menu.
  const [theme, appearance] = [welcome.getByTestId("brand-select"), welcome.getByTestId("theme-select")];
  await expect(theme).toHaveAccessibleName(/^Theme: /);
  await expect(appearance).toHaveAccessibleName(/^Appearance: /);
  const [themeBox, appearanceBox] = [await theme.boundingBox(), await appearance.boundingBox()];
  expect(Math.abs(themeBox!.y - appearanceBox!.y)).toBeLessThan(1);
  expect(Math.abs(themeBox!.height - appearanceBox!.height)).toBeLessThan(1);
  expect(themeBox!.height).toBeGreaterThanOrEqual(80);
  // The position not yet allowed: Turn On Location and Later at its foot
  // (Apple's permission priming, the owner, 2026-11-13), Later going on
  // without asking.
  await expect(welcome.getByTestId("first-flight-location")).toBeVisible();

  // Later: the sheet gone, Search up and its field asking for the
  // destination -- not focused, so no keyboard jumps up. The field says
  // the one word Search, what it asks for its name to a screen reader
  // (the owner, 2026-11-21, 07b501762).
  await welcome.getByTestId("first-flight-later").click();
  await expect(welcome).toHaveCount(0);
  // Risen from the pill to half, so the search's page is seen (rule 11).
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  const search = page.getByTestId("search-airports");
  await expect(search).not.toBeFocused();
  await expect(search).toHaveAttribute("placeholder", "Search");
  await expect(search).toHaveAccessibleName(/destination/i);
  // At rest until it is tapped: the page toggle, no Cancel (the owner,
  // 2026-11-19: "I see cancel on fresh load").
  await expect(page.getByTestId("one-search-cancel")).toHaveCount(0);
  await expect(toggle(page)).toBeVisible();

  // Oshkosh picked: planned from the nearest field to the fix (Campbell),
  // FPL up with the route; the tip on the toggle once it shows FPL.
  await search.click();
  // Tapped, the field in use: its Cancel where the toggle rode.
  await expectSearchInUse(page);
  await search.fill("KOSH");
  await searchAirports(page)
    .filter({ hasText: "KOSH" })
    .first()
    .click({ timeout: slow(15_000) });
  await expect(page).toHaveURL(/dest=KOSH/, { timeout: slow(30_000) });
  await expectPage(page, 1);
  // The tip waits for the toggle, which Search alone has: none on FPL. Search
  // at rest again by its deep link (FPL's Search button goes there too).
  const tip = page.getByTestId("fpl-tip");
  await expect(tip).toHaveCount(0);
  await page.goto(`${page.url()}&open=search`);
  await settle(page);
  await expectPage(page, 0);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Your Flight Plan Is One Tap Away");
  await expect(tip).toContainText("Tap FPL any time");
  // Over the toggle on a phone, its arrow at it, the tip's edge reaching
  // over it, on the screen. In a desktop's side panel the toggle is at the
  // window's top, with no room over it: the tip hangs under it (FplTip).
  const [tipBox, toggleBox] = [await tip.boundingBox(), await toggle(page).boundingBox()];
  if (page.viewportSize()!.width >= 768) expect(tipBox!.y).toBeGreaterThanOrEqual(toggleBox!.y + toggleBox!.height);
  else expect(tipBox!.y + tipBox!.height).toBeLessThanOrEqual(toggleBox!.y);
  expect(tipBox!.x).toBeLessThanOrEqual(toggleBox!.x + toggleBox!.width / 2);
  expect(tipBox!.x + tipBox!.width).toBeGreaterThanOrEqual(toggleBox!.x + toggleBox!.width / 2);
  expect(tipBox!.x).toBeGreaterThanOrEqual(0);
  expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await tip.getByTestId("fpl-tip-close").click();
  await expect(tip).toHaveCount(0);

  // Seen, both: neither offered again on this device, even with no route.
  // Each looked for over the time it took to come the first time: what is
  // claimed is that it does not, which only a window of time shows.
  await page.goto("/app/plan");
  await settle(page);
  await watchFor(page, 1500);
  await expect(welcome).toHaveCount(0);
  await page.goto("/app/plan?dep=C81&dest=KMSN");
  await settle(page);
  await watchFor(page, 1500);
  await expect(tip).toHaveCount(0);
});

test("the FPL tip stays off the sheet all the way up, and once the toggle has been tapped to FPL it is not shown again", async ({
  page,
}) => {
  // The welcome seen, the tip not (lib/firstRunTips' store).
  await page.addInitScript(() => localStorage.setItem("wingtip.tips", JSON.stringify({ state: { seen: ["first-flight"] }, version: 0 })));
  await page.goto("/app/plan?dep=C81&dest=KMSN&open=search");
  await settle(page);
  const tip = page.getByTestId("fpl-tip");
  // A route's link opens at the pill, FPL's figures in its row: half way
  // the first row, and the toggle at its end, are in sight.
  await grabberTo(page, "half");
  await expectPage(page, 0);
  await expect(tip).toBeVisible({ timeout: slow(15_000) });
  // All the way up the toggle is at the screen's top, with no room over it:
  // the tip is not drawn there, over Nearest (the UI audit's B5).
  await grabberTo(page, "full");
  await expect(tip).toHaveCount(0);
  await grabberTo(page, "half");
  await expect(tip).toBeVisible();
  // The toggle tapped to FPL: the tip has done its work.
  await toggle(page).click();
  await expectPage(page, 1);
  await showPage(page, 0);
  await expectPage(page, 0);
  await watchFor(page, 1000);
  await expect(tip).toHaveCount(0);
});

test("on the first flight a Nearest airport tapped is the destination, the ask held till the route is made, never its card", async ({
  page,
}) => {
  // The owner, 2026-11-22: "When I select a nearest airport, it shows
  // destination search the first time but then selecting again shows the
  // airport card." The ask was let go at the first tap while the fix was
  // waited for, so the next tap opened the card.
  test.setTimeout(slow(90_000));
  await page.goto("/app/plan");
  await settle(page);
  await page.getByTestId("first-flight-later").click();
  // Fields off where the airplane is (C81, the departure).
  const fields = page.getByTestId("nearest-strip-field").filter({ hasNotText: /C81/ });
  await expect(fields.nth(1)).toBeVisible({ timeout: slow(30_000) });
  // Tapped, the ask held while the fix is waited for: the search still
  // asks for the destination, so a second tap would pick again.
  await fields.first().click();
  const search = page.getByTestId("search-airports");
  if (!/dest=/.test(page.url())) await expect(search).toHaveAccessibleName(/destination/i);
  // Planned to it, from C81, where the airplane is: no card.
  await expect(page).toHaveURL(/dest=(?!C81)[A-Z0-9]+/, { timeout: slow(30_000) });
  await expect(page.getByTestId("place-card")).toHaveCount(0);
});
