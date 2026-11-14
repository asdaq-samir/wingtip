import { test, expect } from "@playwright/test";
import { openTab, settle, slow } from "./helpers";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * What FPL's route list asks the planner, and what it says when an answer
 * does not come (the 2026-11-14 audits: code CODE-4, web WEB-14).
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

test("the nav log is asked for once with its runways, not again only to add the runway picked into the wind", async ({ page }) => {
  // The brief's run streamed /navlog twice, 26 KB each, the second only to
  // add `patterns=KDLH:27` (WEB-14): no two asks may differ by it alone.
  const asked: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith("/api/planner/navlog")) asked.push(url.search);
  });
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect(page.getByTestId("navlog-fuel")).toBeVisible({ timeout: slow(120000) });
  // A moment for a late pick to have asked again, had it.
  await page.waitForTimeout(2000);
  const withoutPatterns = asked.map((search) => {
    const params = new URLSearchParams(search);
    params.delete("patterns");
    return params.toString();
  });
  expect(asked.length).toBeGreaterThan(0);
  expect(new Set(withoutPatterns).size, asked.join("\n")).toBe(withoutPatterns.length);
});
