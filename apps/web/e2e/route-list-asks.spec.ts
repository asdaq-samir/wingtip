import { test, expect } from "@playwright/test";
import { openTab, settle, slow } from "./helpers";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * What FPL's route list asks the planner, and what it says when an answer
 * does not come (the 2026-11-14 code audit's CODE-4).
 */

test("a field's approaches that could not be fetched are said so in place, never 'None published'", async ({ page }) => {
  // The FAA's procedures for KDLH refused: the pull-down said "None
  // published", telling the pilot the field has no approach (CODE-4).
  await page.route(
    (url) => /\/airport\/KDLH\/procedures$/.test(url.pathname),
    (route) => route.fulfill({ status: 404, json: { detail: "not found" } }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openTab(page, "Nav Log");
  const kdlh = page.getByTestId("procedures").getByRole("region", { name: "KDLH · Arrive" });
  // KDLH's card lists its approach plates (d-TPP), so its approach pull-down is offered.
  const approach = kdlh.locator("[data-testid=procedure-kind][data-kind=approach]");
  await expect(approach).toBeVisible({ timeout: slow(20000) });
  await approach.click();
  const menu = page.getByTestId("procedure-menu");
  await expect(menu.getByText("The FAA's procedures could not be fetched.")).toBeVisible({ timeout: slow(15000) });
  await expect(menu.getByTestId("query-retry")).toBeVisible();
  await expect(menu.getByText("None published")).toHaveCount(0);
});
