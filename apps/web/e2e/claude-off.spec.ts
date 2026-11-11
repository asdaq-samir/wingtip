import { test, expect, type Page } from "@playwright/test";
import { claudeFeatures } from "./claude";
import { airportSearch, openBrief, settle, sideDrawer, slow } from "./helpers";

/**
 * Claude off, as every deployment is by default (app.claude-features OFF,
 * the owner, 2026-11-10: "To keep the cost low, we only add the claude
 * feature later when we decide about subscription model. For now just the
 * free siri and gemini."): the Brief is the engine's alone, the one search
 * offers no Ask, and nothing is sent to the assistant.
 */

/** The assistant's routes, any of them asked: none should be. */
function assistantAsks(page: Page) {
  const asked: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (/^\/api\/planner\/(assistant|words\/|briefing\/narrative|checkpoint-notes\/generate|trip-plan|read-document|oral\/)/.test(path))
      asked.push(path);
  });
  return asked;
}

test.beforeEach(async ({ page }) => {
  await claudeFeatures(page, "OFF");
});

test("with Claude off the Brief is the engine's alone: no Ask, no words, and nothing asked of the assistant", async ({ page }) => {
  const asked = assistantAsks(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect(sideDrawer(page).getByTestId("route-brief")).toHaveAccessibleName(/^Brief/, { timeout: slow(30000) });
  await openBrief(page);
  await expect(sideDrawer(page).getByTestId("brief-glance")).toBeVisible({ timeout: slow(30000) });
  await expect(sideDrawer(page).getByTestId("brief-ask")).toHaveCount(0);
  await expect(sideDrawer(page).getByTestId("brief-risk-words")).toHaveCount(0);
  expect(asked).toEqual([]);
});

test("with Claude off the one search offers no Ask", async ({ page }) => {
  const asked = assistantAsks(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const search = await airportSearch(page);
  await expect(search).toHaveAttribute("placeholder", "Search airports and airplanes");
  await search.fill("osh");
  await expect(sideDrawer(page).getByTestId("one-search-results")).toBeVisible({ timeout: slow(10_000) });
  await expect(sideDrawer(page).getByTestId("search-do-ask")).toHaveCount(0);
  expect(asked).toEqual([]);
});
