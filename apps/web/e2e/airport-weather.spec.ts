import { test, expect } from "@playwright/test";
import { inSheet, settle } from "./helpers";
import { openSettingsPage } from "./mapCard";

/**
 * Settings' Airport Weather (the owner, 2026-11-13): one menu of Off, Flight
 * Category, With Wind and Station Model, With Wind to begin with, where it
 * was a page of four looks and three switches; the getting-worse badge is
 * always drawn. The pick is kept across a reload, as the map's other
 * settings are.
 */
test("the map's Airport Weather is one menu of four, Off first, With Wind to begin with, kept across a reload", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await openSettingsPage(page);
  const look = page.getByTestId("airport-weather-look");
  await inSheet(page, look);
  await expect(look).toHaveAccessibleName("Airport weather: With Wind");
  for (const gone of ["airport-weather-station-close", "airport-weather-arrows", "airport-weather-worse"])
    await expect(page.getByTestId(gone)).toHaveCount(0);

  await look.click();
  for (const id of ["airport-weather-off", "airport-weather-category", "airport-weather-wind", "airport-weather-station"])
    await expect(page.getByTestId(id)).toBeVisible();
  await page.getByTestId("airport-weather-station").click();
  await expect(look).toHaveAccessibleName("Airport weather: Station Model");

  // Loaded afresh: the station model kept.
  await page.reload();
  await settle(page);
  await openSettingsPage(page);
  await inSheet(page, look);
  await expect(look).toHaveAccessibleName("Airport weather: Station Model");
  await look.click();
  await page.getByTestId("airport-weather-category").click();
  await expect(look).toHaveAccessibleName("Airport weather: Flight Category");
  await look.click();
  await page.getByTestId("airport-weather-off").click();
  await expect(look).toHaveAccessibleName("Airport weather: Off");
});
