import { test, expect } from "@playwright/test";
import { controlsInSight, inSheet, openMapSettings, openProfile, settle, slow } from "./helpers";
import { closeMapSettings } from "./mapCard";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its climb read (the setup picks none)

/**
 * Terrain Hazards on the map (features/plan-map/hazard; the Map card's
 * HazardChoice) and the obstacles and weather on the profile
 * (navlog/ProfileHazards). The map's own element says what the colouring
 * is drawn from (data-hazard: the engine's red and amber lines and the
 * altitude's source), as the container has no GPU to look at.
 */
const map = (page: import("@playwright/test").Page) => page.getByTestId("gl-map");

test("Terrain Hazards colour the ground against the plan's cruise on the ground, red within the clearance picked", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await controlsInSight(page);
  await expect(page.getByTestId("altitude-why")).toHaveAccessibleName(/\d,\d{3} feet|FL\d{3}/, { timeout: slow(60000) });
  await expect(map(page)).not.toHaveAttribute("data-hazard", /.*/);
  await openMapSettings(page);
  const card = page.getByTestId("map-settings");
  // Under the half card's edge below its Layers and Route Checkpoints, the
  // card pulled up to it first, as a finger does: at half a card's body
  // does not scroll (rules.md's "Grow, then scroll").
  const on = card.getByTestId("hazard-setting").getByText("On", { exact: true });
  await inSheet(page, on);
  await on.click();
  // The engine's lines under the plan's cruise: red within 1,000 ft (14
  // CFR 91.119(b)), amber 1,000 ft under that, the plan's altitude.
  await expect(map(page)).toHaveAttribute("data-hazard", /^(\d+)\/(\d+)\/plan$/, { timeout: slow(15000) });
  const [red, amber] = (await map(page).getAttribute("data-hazard"))!.split("/").map(Number);
  expect(red! - amber!).toBe(1000);
  await card.getByTestId("hazard-clearance").getByText("2,000 ft").click();
  await expect(map(page)).toHaveAttribute("data-hazard", `${red! - 1000}/${amber! - 1000}/plan`);
  // By itself in flight: off on the ground.
  await card.getByTestId("hazard-setting").getByText("In Flight").click();
  await expect(map(page)).not.toHaveAttribute("data-hazard", /.*/);
  await closeMapSettings(page);
});

test("the profile draws the obstacles along the route and says whose its weather is", async ({ page }) => {
  test.slow();
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await controlsInSight(page);
  await expect(page.getByTestId("altitude-why")).toHaveAccessibleName(/\d,\d{3} feet|FL\d{3}/, { timeout: slow(60000) });
  await openProfile(page);
  const card = page.getByTestId("profile-card");
  await expect(card.getByTestId("profile-hazards")).toBeAttached({ timeout: slow(30000) });
  // Chicago to Duluth passes towers of the DOF's: posts, the tallest named MSL (AGL).
  await expect(card.getByTestId("profile-obstacle").first()).toBeAttached();
  await expect(card.getByTestId("profile-obstacle-name").first()).toHaveText(/^\d[\d,]* \(\d[\d,]*\)$/);
  // Each weather line with its source, or said not available.
  await expect(card.getByTestId("profile-weather-key")).toContainText(/TAF|NOAA GFS|G-AIRMET|not available/);
});
