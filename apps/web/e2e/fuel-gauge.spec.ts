import { test, expect, type Page } from "@playwright/test";
import { openPanel, openRoute, settle, timelineLine } from "./helpers";
import { pickAirplane } from "./startState";

/**
 * The fuel in the tanks set by tapping a field's gauge on FPL's timeline
 * (the owner, 2026-11-21: "can we set the fuel tank by tapping on it?"):
 * at the departure the fuel on board at engine start, at a stop what the
 * tanks are fuelled to there -- Full, No fuel, or the gallons typed --
 * kept in the address (`tanks`), the gauges walked from it by the engine
 * (fuel_in_tanks), more than the tanks hold kept with a warning, and the
 * plan's Undo putting it back. The stock C172, 40 gal usable
 * (data/aircraft/c172.json).
 */

// Changes within planHistory's SETTLE_MS are one step to undo, as the
// page's own settling is: each edit here comes after it, as a pilot's do.
const pastSettling = (page: Page) => page.waitForTimeout(1600);

test.beforeEach(async ({ page }) => {
  await pickAirplane(page);
});

test("a field's gauge sets the fuel on board at the start and after a stop, in the address, and Undo puts it back", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KMSN");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const departure = timelineLine(page, "C81").getByTestId("fuel-set-departure");
  // Full at first: the usable fuel, the button named with the gallons it shows.
  await expect(departure).toHaveAccessibleName("40 gal, fuel on board: change", { timeout: 60_000 });

  // 20 on board at engine start, typed.
  await pastSettling(page);
  await departure.click();
  const field = page.getByTestId("fuel-set-input").locator("input").or(page.getByTestId("fuel-set-input")).first();
  await field.fill("20");
  await page.getByTestId("fuel-set-done").click();
  await expect(page).toHaveURL(/[?&]tanks=C81(%3A|:)20(&|$)/);
  await expect(departure).toHaveAccessibleName("20 gal, fuel on board: change");

  // More than the tanks hold: kept, with a warning (warn, never limit).
  await pastSettling(page);
  await departure.click();
  await field.fill("60");
  await expect(page.getByTestId("fuel-set-note")).toHaveText("More than the 40 gal the tanks hold");
  await page.getByTestId("fuel-set-done").click();
  await expect(departure).toHaveAccessibleName("60 gal, fuel on board: change");

  // KMSN: no fuel bought there, what it lands with kept.
  const stop = timelineLine(page, "KMSN").getByTestId("fuel-set-stop");
  await expect(stop).toBeVisible();
  await pastSettling(page);
  await stop.click();
  await page.getByTestId("fuel-set-pick").getByRole("button", { name: "No fuel" }).click();
  await page.getByTestId("fuel-set-done").click();
  await expect(page).toHaveURL(/[?&]tanks=[^&]*KMSN(%3A|:)0/);

  // The plan's Undo: KMSN's fuel back to full, then the start's 60 to 20.
  await page.locator("body").focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page).not.toHaveURL(/KMSN(%3A|:)0/);
  await expect(departure).toHaveAccessibleName("60 gal, fuel on board: change");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(departure).toHaveAccessibleName("20 gal, fuel on board: change");
});
