import { test, expect, type Page } from "@playwright/test";
import { openConsole, openMapSettings, settle, slow, consoleSheet } from "./helpers";
import { violations } from "./a11yAxe";
import { pickAirplane } from "./startState";

/**
 * Accessibility by axe-core on the screens a11y.spec does not open: each
 * of the console's places and the cards a link opens, WCAG 2 A and AA, no
 * serious or critical violation; then the keyboard's way out of a card
 * and back to what opened it, the sign-in dialog signed out, the narrow
 * screen at 320 points and Reduce Motion. The chart's canvas is left out
 * as there (a11yAxe).
 */
test.beforeEach(({ page }) => pickAirplane(page));

/** A card in sight, what the address opened, at rest. */
async function cardOpen(page: Page) {
  await settle(page);
  await expect(page.locator("[data-sheet-card][data-open]").first()).toBeVisible({ timeout: slow(30000) });
}

// The console's places and the cards each opens by its link (useOpenScreen,
// design/screens.json), and a field's, a VOR's, a TFR's and an airplane's.
const SCREENS: [string, string][] = [
  ["Settings", "/app/plan?open=setup"],
  ["Saved Flights", "/app/plan?open=flights"],
  ["Favorites", "/app/plan?open=favorites"],
  ["Nearest", "/app/plan?open=nearest"],
  ["Emergency Assistant", "/app/plan?open=emergency"],
  ["Checklists", "/app/plan?open=checklists"],
  ["Your Airplanes", "/app/plan?open=airplanes"],
  ["Logbook", "/app/plan?open=logbook"],
  ["Coach", "/app/plan?open=coach"],
  ["Personal Minimums", "/app/plan?open=minimums"],
  ["Guide", "/app/plan?open=guide"],
  ["About", "/app/plan?open=about"],
  ["an airport's card", "/app/plan?place=KDLH"],
  ["a VOR's card", `/app/plan?navaid=${encodeURIComponent("OBK@42.2214,-87.9517")}`],
  ["a TFR's card", "/app/plan?tfr=6%2F4116"],
  ["an airplane's card", "/app/plan?flight=a89c1e"],
];

for (const [name, address] of SCREENS) {
  test(`${name}, by axe`, async ({ page }) => {
    await page.goto(address);
    await cardOpen(page);
    expect(await violations(page), name).toEqual([]);
  });
}

test("the map's settings: Escape puts the card away and gives the focus back to its button", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await openMapSettings(page);
  expect(await violations(page, '[data-testid="map-settings"]')).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("map-settings")).toHaveCount(0);
  await expect(page.locator("[data-map-controls]").getByTestId("map-settings-button")).toBeFocused();
});

test("You: Escape closes it and the focus is back on the account button", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await openConsole(page);
  await page.keyboard.press("Escape");
  await expect(consoleSheet(page)).toHaveCount(0);
  await expect(page.getByTestId("account-button")).toBeFocused();
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the sign-in dialog, by axe, its address field named and Escape closing it", async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await openConsole(page);
    const sheet = consoleSheet(page).getByTestId("setup-page");
    await sheet.getByRole("button", { name: "Sign In", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Sign in to Wingtip Maps" });
    await expect(dialog.getByLabel("Email address")).toBeVisible();
    expect(await violations(page, '[role="dialog"]')).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});

test("at 320 points wide, Settings and the logbook reflow: nothing sideways (WCAG 1.4.10)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const address of ["/app/plan?open=setup", "/app/plan?open=logbook"]) {
    await page.goto(address);
    await cardOpen(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), address).toBe(true);
  }
});

test("with Reduce Motion a card arrives without its slide", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/plan?open=setup");
  await cardOpen(page);
  // index.css's Reduce Motion: every transition and animation near none.
  const longest = await page
    .locator("[data-sheet-card][data-open]")
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return Math.max(
        ...[s.transitionDuration, s.animationDuration].flatMap((d) =>
          d.split(",").map((x) => parseFloat(x) * (x.includes("ms") ? 1 : 1000)),
        ),
      );
    });
  expect(longest).toBeLessThan(1);
});
