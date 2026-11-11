import { test, expect } from "@playwright/test";
import { controlsInSight, openProfile, settle, slow } from "./helpers";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its climb read (the setup picks none)

/**
 * The altitude on the route's profile (the owner's pick, 2026-11-10,
 * docs/design/rules.md section 6): a waypoint's own altitude set from its
 * mark, Start At or Cross At. The slider, Set and the Altitude Advisor are
 * plans.spec.ts's smoke journey.
 */

test("plan page: a waypoint's altitude is set on the profile, Start At sending the change to begin there", async ({ page }) => {
  test.slow();
  await page.goto("/app/plan?dep=C81&stops=VPBNG&dest=KDLH");
  await settle(page);
  await controlsInSight(page);
  await expect(page.getByTestId("altitude-why")).toHaveAccessibleName(/\d,\d{3} feet|FL\d{3}/, { timeout: slow(60000) });
  await openProfile(page);
  const card = page.getByTestId("profile-card");
  await card.getByRole("button", { name: "VPBNG: set the altitude at it" }).click();
  await page.getByTestId("leg-altitude-input").fill("065");
  await page.getByTestId("leg-altitude-mode").getByText("Start At").click();
  // Where the change is flown, the engine's (altitude_change).
  await expect(page.getByTestId("leg-altitude-change")).toContainText(/Climb|Descent|Level/);
  await page.getByTestId("leg-altitude-set").click();
  await expect(page).toHaveURL(/[?&]altitudes=VPBNG(%3A|:)6500/);
  await expect(page).toHaveURL(/[?&]altitude_starts=VPBNG/);
});
