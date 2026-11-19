import { test, expect } from "@playwright/test";
import { mapStill, settle } from "./helpers";

/**
 * The chart turns as Apple Maps' map turns (the owner, 2026-11-17): two
 * fingers twisted, a right drag, or Shift and the arrows from the
 * keyboard, MapLibre's own (makeMap). The compass over the 3D button shows
 * only while the map is off north up, Apple Maps' dial, its red mark at north,
 * and a tap turns it north up again (CompassButton, the camera's northUp).
 */
test("the map turns from the keyboard, and the compass turns it north up again", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  // Over the 3D button, at the left on a phone and the right from md up.
  const compass = page.getByTestId("map-compass");
  // North up: no compass.
  await expect(compass).toHaveCount(0);
  // The chart's own keys: Shift and the right arrow turn it 15° a press.
  await page.getByTestId("gl-map").first().locator("canvas").first().focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await mapStill(page);
  await expect(compass).toBeVisible();
  expect(Number(await compass.getAttribute("data-bearing"))).not.toBe(0);
  await expect(compass).toHaveAccessibleName(/^Compass, the map turned \d+°: turn north up$/);
  // A tap, north up again, and the compass goes.
  await compass.click();
  await mapStill(page);
  await expect(compass).toHaveCount(0);
});
