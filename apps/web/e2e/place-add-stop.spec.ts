import { test, expect } from "@playwright/test";
import { settle, sideDrawer } from "./helpers";

/**
 * An airport already on the route keeps Add Stop on its card, greyed, and
 * says why (the owner, 2026-11-11: "Add stop button not showing for airport
 * already in the plan, show it but disable it"). A field off the route can
 * be added.
 */
test("Add Stop is shown but greyed for an airport already on the route", async ({ page }) => {
  await page.goto("/app/plan?dep=KMSN&dest=KOSH&place=KOSH");
  await settle(page);
  const card = sideDrawer(page).getByTestId("place-card");
  const addStop = card.getByTestId("place-add-stop");
  await expect(addStop).toBeVisible({ timeout: 20_000 });
  await expect(addStop).toBeDisabled();
  await expect(addStop).toHaveAccessibleName(/already on the route/);
  await expect(card.getByTestId("place-actions").locator("[data-testid]").filter({ visible: true })).toHaveCount(4);
});

test("Add Stop takes a tap for an airport off the route", async ({ page }) => {
  await page.goto("/app/plan?dep=KMSN&dest=KOSH&place=KJVL");
  await settle(page);
  const addStop = sideDrawer(page).getByTestId("place-card").getByTestId("place-add-stop");
  await expect(addStop).toBeEnabled({ timeout: 20_000 });
});
