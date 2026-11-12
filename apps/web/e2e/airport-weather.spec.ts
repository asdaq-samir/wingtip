import { test, expect } from "@playwright/test";
import { openMapSettings, settle } from "./helpers";

/**
 * The Map card's Airport Weather (the owner's pick, 2026-11-10): Off,
 * Halo, Dot or Station, Halo to begin with, and three switches, all on
 * to begin with -- the station model when zoomed in, the wind barbs and
 * the getting-worse badge. Off turns the switches off with it; the look is
 * kept across a reload, as the map's other settings are.
 */
test("the map's Airport Weather is a halo with its three switches on, kept across a reload", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await openMapSettings(page);
  const look = page.getByTestId("airport-weather-look");
  await expect(look.getByRole("button")).toHaveText(["Off", "Halo", "Dot", "Station"]);
  await expect(look.getByRole("button", { name: "Halo" })).toHaveAttribute("aria-pressed", "true");
  const switches = ["airport-weather-station-close", "airport-weather-arrows", "airport-weather-worse"];
  for (const id of switches) await expect(page.getByTestId(id)).toHaveAttribute("aria-checked", "true");

  // Station draws the station model at every zoom: its zoomed-in switch
  // has nothing more to say.
  await look.getByRole("button", { name: "Station" }).click();
  await expect(page.getByTestId("airport-weather-station-close")).toBeDisabled();

  // Off: no weather on the fields, and the switches off with it.
  await look.getByRole("button", { name: "Off" }).click();
  for (const id of switches) {
    await expect(page.getByTestId(id)).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId(id)).toBeDisabled();
  }

  // Loaded afresh: Off kept; back to the halo, the switches as they were.
  await page.reload();
  await settle(page);
  await openMapSettings(page);
  await expect(look.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
  await look.getByRole("button", { name: "Halo" }).click();
  for (const id of switches) await expect(page.getByTestId(id)).toHaveAttribute("aria-checked", "true");
});
